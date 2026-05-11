/**
 * Next.js 14 instrumentation hook. Called once per runtime at server start.
 * Wires up Sentry server/edge configs for the Admin app.
 *
 * Requires experimental.instrumentationHook: true in next.config.js.
 */

export async function register() {
  // Skip Sentry in dev — its dependency graph (@sentry/node → @prisma/instrumentation
  // → @opentelemetry/instrumentation) adds seconds to every route's first compile.
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
