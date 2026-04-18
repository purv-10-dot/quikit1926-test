/**
 * Next.js 14 instrumentation hook. Called once per runtime at server start.
 * Wires up Sentry server/edge configs for QuikScale.
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
