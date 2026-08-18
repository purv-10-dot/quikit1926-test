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

/**
 * Pull safe, explicit fields off an unknown thrown value for logging — NEVER
 * the error object itself.
 *
 * `redact` above only censors the paths it is given, so `logger.error({ error: e })`
 * serialises whatever the throw site happened to hang off that error. SDK errors
 * are the live risk: `livekit-server-sdk`'s `ServerError` carries
 * `status`/`code`/`metadata`, and `metadata` is populated from a response body —
 * an SDK-internals fact that could stop holding after a version bump. Naming
 * four fields means there is nothing for a `metadata` (or a `config`, or a
 * `request`) to ride in on, whatever future shape an error takes.
 *
 * This is the single copy for the app; `services/realtime/src/logger.ts` keeps
 * its own because that service shares no code with us. See the planted-secret
 * tests in `logger.test.ts` and in `sfu-provider.livekit.test.ts` for the
 * empirical checks these comments don't get to skip.
 */
export function errorFields(err: unknown): {
  errName: string;
  errMessage: string;
  errCode: string | number | undefined;
  errStatus: number | undefined;
} {
  const e = err as { code?: unknown; status?: unknown } | null | undefined;
  return {
    errName: err instanceof Error ? err.name : typeof err,
    errMessage: err instanceof Error ? err.message : "unknown error",
    errCode: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
    errStatus: typeof e?.status === "number" ? e.status : undefined,
  };
}

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
