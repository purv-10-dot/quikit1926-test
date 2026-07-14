import { randomUUID } from "node:crypto";
import pino from "pino";

/**
 * Structured JSON logger. Level from `LOG_LEVEL`; silent under tests so the
 * suite stays quiet. Tokens/secrets are redacted by pino's redact paths AND by
 * `redactSecrets` for ad-hoc objects. Never log message content or PII bodies.
 */
const isTest = !!process.env.VITEST || process.env.NODE_ENV === "test";
const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

export const logger = pino({
  level,
  redact: {
    paths: ["authorization", "headers.authorization", "token", "password", "cookie", "secret"],
    censor: "[redacted]",
  },
});

/** Resolve a request id: echo an inbound `X-Request-Id`, else generate one. */
export function requestId(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get("x-request-id") || randomUUID();
}

const SECRET_KEY = /authorization|token|secret|password|cookie|x-internal-secret/i;

/** Recursively redact secret-looking keys from an object (for safe logging). */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactSecrets(v, depth + 1);
  }
  return out;
}

/** Pathname of a request URL (no query) for log lines. */
export function pathOf(req: { url: string }): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}
