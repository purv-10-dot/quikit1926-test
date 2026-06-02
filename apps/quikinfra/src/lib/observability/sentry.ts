/**
 * Sentry integration — optional, dynamically loaded.
 *
 * The real @sentry/nextjs package isn't installed by default. When
 * `SENTRY_DSN` is set AND the package is available at runtime, `init()` is
 * called automatically on first import. Otherwise all capture calls are
 * silent no-ops so the app runs fine without Sentry.
 *
 * This matches the storage driver pattern (S3 SDK is also hidden from
 * webpack via indirect require) — the optional dependency is genuinely
 * optional and the build succeeds without it.
 *
 * To enable:
 *   1. `pnpm add @sentry/nextjs` in apps/quikinfra
 *   2. Set SENTRY_DSN and (optionally) SENTRY_ENVIRONMENT in the deploy env
 *   3. Restart the app
 */

let initialized = false;
let sdk: any = null;

function tryLoad(): any {
  if (sdk !== null) return sdk;
  if (!process.env.SENTRY_DSN) {
    sdk = false;
    return false;
  }
  try {
    // Hidden from webpack's static analyzer — same trick as s3-driver.ts
    const dynRequire = new Function("m", "return require(m)") as (m: string) => any;
    sdk = dynRequire("@sentry/nextjs");
    return sdk;
  } catch {
    // Not installed — stay in no-op mode
    sdk = false;
    return false;
  }
}

function ensureInit(): void {
  if (initialized) return;
  const s = tryLoad();
  if (!s) {
    initialized = true;
    return;
  }
  try {
    s.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      release: process.env.APP_RELEASE ?? process.env.npm_package_version,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
      // Don't send PII by default — tenant + request id are enough to find
      // the issue in our own audit log.
      sendDefaultPii: false,
    });
  } catch (err) {
    // Never let Sentry init break the app
    process.stderr.write(`[sentry] init failed: ${String(err)}\n`);
  }
  initialized = true;
}

/**
 * Capture an exception. Safe to call with anything — unknown errors, plain
 * strings, or full Error objects. No-op if Sentry isn't configured.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  ensureInit();
  const s = sdk;
  if (!s) return;
  try {
    if (context) {
      s.withScope((scope: any) => {
        for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
        s.captureException(err);
      });
    } else {
      s.captureException(err);
    }
  } catch {
    // Sentry itself threw — swallow so we don't double-fault
  }
}

/** Capture a log-level message (rare — prefer logger.error + captureException). */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  ensureInit();
  const s = sdk;
  if (!s) return;
  try {
    s.captureMessage(message, level);
  } catch {
    /* swallow */
  }
}

/** Attach org + user context to the current Sentry scope. */
export function setUserContext(ctx: { userId?: string; orgId?: string; roleKey?: string }): void {
  ensureInit();
  const s = sdk;
  if (!s) return;
  try {
    s.setUser({ id: ctx.userId, tenant: ctx.orgId, role: ctx.roleKey });
  } catch {
    /* swallow */
  }
}

/** True if Sentry is actually configured and loaded. */
export function isSentryActive(): boolean {
  ensureInit();
  return !!sdk;
}
