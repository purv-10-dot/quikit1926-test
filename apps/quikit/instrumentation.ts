/**
 * Next.js 14 instrumentation hook. Called once per runtime at server start.
 *
 * Wires up Sentry server/edge configs so unhandled errors across API routes,
 * middleware, and SSR are captured. Client-side config loads via a separate
 * import in the root layout (see app/layout.tsx).
 *
 * No-ops if SENTRY_DSN is unset — the sentry.*.config files check that
 * themselves.
 *
 * Requires experimental.instrumentationHook: true in next.config.js.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
