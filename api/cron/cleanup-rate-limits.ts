import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";

type ApiRequest = IncomingMessage;
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function authorized(req: ApiRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const received = header(req, "authorization") ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) return false;

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(received, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!cronSecret) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!databaseUrl) {
    res.status(503).json({ ok: false });
    return;
  }

  try {
    const sql = neon(databaseUrl);
    await sql`
      DELETE FROM public.api_rate_limit_windows
      WHERE window_started_at < now() - interval '24 hours'
    `;
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
}
