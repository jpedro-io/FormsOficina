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
