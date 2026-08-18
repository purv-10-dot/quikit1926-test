import pino from "pino";

/**
 * Vendored structured logger for the realtime gateway.
 *
 * The standalone gateway imported `logger` from `@quikit/shared`, but in the
 * merged monorepo `@quikit/shared` exports no logger, and the app's logger
 * (`apps/quikchat/lib/shared/logger.ts`) is app-internal and off-limits to a
 * self-contained service. So we vendor a small pino logger that matches the
 * app's style: level from `LOG_LEVEL`, silent under Vitest, secrets redacted.
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
 * Pull safe, explicit fields off an unknown thrown value for logging — NEVER the
 * error object itself.
 *
 * `redact` above only matches the paths it is given, so `logger.error({ error: e })`
 * serialises whatever the throw site happened to hang off that error: a `config`,
 * a `request`, a `metadata` bag sourced from a response body. Naming the four
 * fields we want means there is nothing for a future error shape to smuggle
 * through, whatever it carries.
 *
 * Mirrors `errorFields()` in `apps/quikchat/lib/shared/logger.ts` — same
 * discipline, duplicated because this service shares no code with the app. See
 * that module's "never carries a planted secret off the error object" test for
 * the empirical check; keep the two implementations identical.
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
