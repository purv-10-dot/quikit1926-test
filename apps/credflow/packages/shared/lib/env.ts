/**
 * Env-var helpers that fail loud in prod instead of silently defaulting to
 * localhost.
 *
 * Rationale: silent `process.env.X || "http://localhost:..."` fallbacks are
 * the #1 source of "works in dev, breaks in prod" URL bugs. We centralise
 * the prod-safe pattern here so every app uses the same shape.
 *
 * Usage:
 *   const APP_URL = requireProdEnv("APP_URL", "http://localhost:3001");
 *   // In production, throws if APP_URL is unset.
 *   // In dev / test, returns the fallback.
 *
 *   const base = requireEnv("NEXTAUTH_URL");
 *   // Throws in every environment if missing.
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Returns `process.env[name]`. In production, throws if unset. In dev / test,
 * returns the provided `devFallback` (or throws if no fallback and unset).
 */
export function requireProdEnv(name: string, devFallback?: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd()) {
    throw new Error(
      `[env] ${name} is required in production. Set it on the Vercel project ` +
        `before this code path is hit.`,
    );
  }
  if (devFallback !== undefined) return devFallback;
  throw new Error(
    `[env] ${name} is not set. In dev you can export a value or add it to .env.local.`,
  );
}

/**
 * Returns `process.env[name]` or throws regardless of environment.
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v) return v;
  throw new Error(`[env] ${name} is required.`);
}
