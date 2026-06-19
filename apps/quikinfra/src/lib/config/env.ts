/**
 * Environment Validation
 *
 * Parses and validates `process.env` through a Zod schema at first import.
 * If a required var is missing or malformed in production, the app throws
 * a clear, actionable error at startup instead of silently 500-ing when
 * the first request touches the broken path.
 *
 * Contract:
 *   - Called once from `lib/db.ts` (the central DB client re-export, the
 *     earliest-loaded server-side module that every DB-touching route
 *     imports). Additional callers are free but not required — the cached
 *     result is reused.
 *   - Dev mode is permissive: missing optional vars default sensibly.
 *   - Production mode is strict: `NEXTAUTH_SECRET` and `DATABASE_URL`
 *     are REQUIRED.
 *
 * Storage config is NOT validated here. File uploads read AWS_* directly in
 * the storage layer (src/lib/storage) — same convention as quiktrack.
 *
 * Importing this module has a side effect (validation). That's intentional —
 * production boot should fail loudly on config errors. Never wrap in
 * try/catch at the import site.
 *
 * Usage:
 *   import { env } from "@/lib/config/env";
 *   if (env.NODE_ENV === "production") { ... }
 */

import { z } from "zod";

const LEVEL = z.enum(["debug", "info", "warn", "error"]);

const schema = z
  .object({
    // ── Core ─────────────────────────────────────────────────────
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "development", "staging", "production"]).optional(),
    APP_RELEASE: z.string().optional(),
    LOG_LEVEL: LEVEL.optional(),

    // ── Database ─────────────────────────────────────────────────
    DATABASE_URL: z
      .string()
      .url("DATABASE_URL must be a valid URL, e.g. postgresql://user:pass@host:5432/db")
      .optional(),

    // ── Auth ─────────────────────────────────────────────────────
    NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 chars").optional(),
    NEXTAUTH_URL: z.string().url().optional(),

    // ── Observability ────────────────────────────────────────────
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

    // ── Rate limiting ────────────────────────────────────────────
    RATE_LIMIT_DISABLED: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === "production";

    // Production MUST have real auth + DB
    if (isProd) {
      if (!env.NEXTAUTH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["NEXTAUTH_SECRET"],
          message: "NEXTAUTH_SECRET is required in production",
        });
      }
      if (!env.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "DATABASE_URL is required in production",
        });
      }
    }
  });

type Env = z.infer<typeof schema>;

let _env: Env | null = null;

/**
 * Validate `process.env` and return a typed, normalized config object.
 * Throws on first call in production if config is invalid — the app will
 * fail to boot with a clear error message listing every missing/invalid
 * variable, instead of silently 500-ing when the first request hits a
 * broken path.
 */
export function loadEnv(): Env {
  if (_env) return _env;

  // Skip validation during `next build` — Next runs route handlers in a
  // "collect page data" pass under NODE_ENV=production, but the build
  // environment legitimately has dev/CI config (local storage, demo mode).
  // The real validation happens at runtime boot, not at compile time.
  // `NEXT_PHASE` is set by Next.js itself and is stable across versions.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    _env = process.env as unknown as Env;
    return _env;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const msg =
      `[env] Invalid environment configuration:\n${issues}\n\n` +
      `See apps/quikinfra/.env.example for the full list of variables.`;

    if ((process.env.NODE_ENV ?? "development") === "production") {
      // Hard fail — never boot a production server with bad config
      throw new Error(msg);
    }
    // In dev/test, warn but continue with the partial parse (process.env as-is)
    process.stderr.write(msg + "\n");
    _env = process.env as unknown as Env;
    return _env;
  }
  _env = parsed.data;
  return _env;
}

// Eagerly validate on import so bad config fails at boot, not at first request.
export const env = loadEnv();
