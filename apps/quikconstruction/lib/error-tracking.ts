/**
 * Structured error logging. Sentry-ready.
 *
 * To wire Sentry:
 *   1. `npm i @sentry/nextjs -w apps/quikconstruction`
 *   2. Add DSN env var: SENTRY_DSN=...
 *   3. Uncomment the Sentry block below
 *   4. Done — every reportError() call fans out to both console + Sentry
 */

export interface ErrorContext {
  route?: string;
  userId?: string | null;
  tenantId?: string | null;
  extra?: Record<string, unknown>;
}

export function reportError(err: unknown, context: ErrorContext = {}): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // Always log structured
  console.error("[error]", { message: msg, stack, ...context });

  // Uncomment when SENTRY_DSN is set:
  //
  // if (process.env.SENTRY_DSN) {
  //   const Sentry = require("@sentry/nextjs");
  //   Sentry.withScope((scope: any) => {
  //     if (context.route) scope.setTag("route", context.route);
  //     if (context.tenantId) scope.setTag("tenantId", context.tenantId);
  //     if (context.userId) scope.setUser({ id: context.userId });
  //     if (context.extra) scope.setContext("extra", context.extra);
  //     Sentry.captureException(err instanceof Error ? err : new Error(msg));
  //   });
  // }
}
