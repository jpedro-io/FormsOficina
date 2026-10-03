import type { IncomingMessage, ServerResponse } from "node:http";

type ApiRequest = IncomingMessage;
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(req: ApiRequest): boolean {
  const origin = header(req, "origin");
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const secureOrigin = parsedOrigin.protocol === "https:";
    const localDevelopmentOrigin = parsedOrigin.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
    if (!secureOrigin && !localDevelopmentOrigin) return false;

    const configuredOrigin = process.env.PUBLIC_SITE_ORIGIN?.trim();
    if (configuredOrigin) return parsedOrigin.origin === new URL(configuredOrigin).origin;
    const host = header(req, "host");
    return Boolean(host) && parsedOrigin.host.toLowerCase() === host?.toLowerCase();
  } catch {
    return false;
  }
}

function isLocalDevelopment(): boolean {
  return process.env.APP_ENV === "local" && process.env.VERCEL !== "1";
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ready: false });
    return;
  }

  if (!sameOrigin(req)) {
    res.status(403).json({ ready: false });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const configuredRateSecret = process.env.RATE_LIMIT_SECRET?.trim() ?? "";
  const rateLimitSecret = Buffer.byteLength(configuredRateSecret, "utf8") >= 32
    ? configuredRateSecret
    : databaseUrl ?? "";
  const ready = Boolean(
    databaseUrl
    && Buffer.byteLength(rateLimitSecret, "utf8") >= 32
  );

  res.status(200).json({
    ready,
    localDevelopment: isLocalDevelopment()
  });
}
