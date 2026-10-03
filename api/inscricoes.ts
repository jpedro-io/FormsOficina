import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

type SignupInput = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  rating: number;
};

const MAX_BODY_BYTES = 5_000;
const REQUESTS_PER_MINUTE = 10;
const MAX_WINDOW_COUNT = REQUESTS_PER_MINUTE + 1;

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function reply(res: ApiResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

function isSameOrigin(req: ApiRequest): boolean {
  const origin = header(req, "origin");
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    const secureOrigin = parsedOrigin.protocol === "https:";
    const localDevelopmentOrigin = parsedOrigin.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
    if (!secureOrigin && !localDevelopmentOrigin) return false;

    const configuredOrigin = process.env.PUBLIC_SITE_ORIGIN?.trim();
    if (configuredOrigin) {
      return parsedOrigin.origin === new URL(configuredOrigin).origin;
    }

    const requestHost = header(req, "host");
    return Boolean(requestHost) && parsedOrigin.host.toLowerCase() === requestHost?.toLowerCase();
  } catch {
    return false;
  }
}

function clientAddress(req: ApiRequest): string {
  const forwarded = (header(req, "x-vercel-forwarded-for") ?? header(req, "x-forwarded-for"))
    ?.split(",")[0]
    ?.trim();
  if (forwarded && forwarded.length <= 64) return forwarded;
  return "unknown";
}

function validCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;

  for (let position = 9; position < 11; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(cpf[index]) * (position + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;
    if (Number(cpf[position]) !== checkDigit) return false;
  }
  return true;
}

function normalizeInput(value: unknown): SignupInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string"
    ? record.name.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const cpf = typeof record.cpf === "string" ? record.cpf.replace(/\D/g, "") : "";
  const phone = typeof record.phone === "string" ? record.phone.replace(/\D/g, "") : "";
  const ratingText = typeof record.rating === "number" || typeof record.rating === "string"
    ? String(record.rating).trim()
    : "";

  if (name.length < 2 || name.length > 120) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  if (!validCpf(cpf)) return null;
  if (!/^\d{10,11}$/.test(phone)) return null;
  if (!/^[0-5]$/.test(ratingText)) return null;

  return { name, email, cpf, phone, rating: Number(ratingText) };
}

function parseBody(req: ApiRequest): unknown | null {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");

  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return null;
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  try {
    const encoded = JSON.stringify(body);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > MAX_BODY_BYTES) return null;
  } catch {
    return null;
  }
  return body;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    reply(res, 405, { ok: false, message: "Método não permitido." });
    return;
  }

  if (!isSameOrigin(req)) {
    reply(res, 403, { ok: false, message: "Origem não permitida." });
    return;
  }

  const contentType = header(req, "content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    reply(res, 415, { ok: false, message: "Formato de envio inválido." });
    return;
  }

  const contentLength = Number(header(req, "content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    reply(res, 413, { ok: false, message: "Envio muito grande." });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const configuredRateSecret = process.env.RATE_LIMIT_SECRET?.trim() ?? "";
  // The private database URL is a server-side secret and is a safe fallback HMAC key for local and production rate limiting.
  const rateLimitSecret = Buffer.byteLength(configuredRateSecret, "utf8") >= 32
    ? configuredRateSecret
    : databaseUrl ?? "";
  if (!databaseUrl || Buffer.byteLength(rateLimitSecret, "utf8") < 32) {
    reply(res, 503, { ok: false, message: "O envio não está disponível no momento. Tente novamente mais tarde." });
    return;
  }

  const bucketHash = createHmac("sha256", rateLimitSecret)
    .update(clientAddress(req))
    .digest("hex");

  try {
    const sql = neon(databaseUrl);
    await sql`
      DELETE FROM public.api_rate_limit_windows
      WHERE window_started_at < now() - interval '24 hours'
        AND bucket_hash <> ${bucketHash}
    `;

    const rateRows = await sql`
      INSERT INTO public.api_rate_limit_windows AS current_window
        (bucket_hash, window_started_at, request_count)
      VALUES (${bucketHash}, now(), 1)
      ON CONFLICT (bucket_hash) DO UPDATE
      SET request_count = CASE
            WHEN current_window.window_started_at <= now() - interval '1 minute' THEN 1
            ELSE LEAST(current_window.request_count + 1, ${MAX_WINDOW_COUNT})
          END,
          window_started_at = CASE
            WHEN current_window.window_started_at <= now() - interval '1 minute' THEN now()
            ELSE current_window.window_started_at
          END
      RETURNING request_count
    `;

    if (Number(rateRows[0]?.request_count) > REQUESTS_PER_MINUTE) {
      reply(res, 429, { ok: false, message: "Muitas tentativas em pouco tempo. Aguarde e tente novamente." });
      return;
    }

    const parsedBody = parseBody(req);
    if (!parsedBody) {
      reply(res, 400, { ok: false, message: "Confira os dados e tente novamente." });
      return;
    }

    const input = normalizeInput(parsedBody);
    if (!input) {
      reply(res, 422, { ok: false, message: "Confira os dados e tente novamente." });
      return;
    }

    const insertedRows = await sql`
      INSERT INTO public.workshop_signups (name, email, cpf, phone, rating)
      VALUES (${input.name}, ${input.email}, ${input.cpf}, ${input.phone}, ${input.rating})
      ON CONFLICT (cpf) DO NOTHING
      RETURNING id
    `;

    if (insertedRows.length === 0) {
      reply(res, 409, { ok: false, message: "Este CPF já possui uma resposta registrada." });
      return;
    }

    reply(res, 201, { ok: true });
  } catch {
    // Raw database errors can contain connection details or submitted values, so they stay server-side.
    reply(res, 500, { ok: false, message: "Erro :( Não foi possível enviar agora. Tente novamente." });
  }
}
