/**
 * SA-Tech-Debt-1 — generic API logging wrapper.
 *
 * Wraps any route handler (admin, super-admin, public, tenant-scoped) and logs
 * the call to ApiCall after the response resolves. Works with both:
 *
 *   - `(req: NextRequest) => Promise<NextResponse>`
 *   - `(req: NextRequest, ctx: { params: ... }) => Promise<NextResponse>`
 *
 * Usage in a route file:
 *
 *   import { withApiLogging } from "@quikit/shared/withApiLogging";
 *   export const GET = withApiLogging("admin", async (req) => { ... });
 *
 * The wrapper never throws — logging failures are swallowed inside logApiCall.
 * Status and duration are read from the real response, so we don't need
 * any cooperation from the inner handler.
 *
 * Tenant/user context: the wrapper tries to read the session once via a
 * resolver callback. Defaults to "no session". Routes that already know the
 * tenantId/userId can pass them explicitly by using `withApiLoggingContext`.
 */

import type { NextRequest, NextResponse } from "next/server";
import { logApiCall } from "./apiLogging";

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse> | NextResponse;
type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>;

export interface WithApiLoggingOptions {
  /** Called at the end of the request to resolve tenant/user for logging. */
  resolveContext?: (req: NextRequest) => Promise<{ tenantId?: string | null; userId?: string | null }> | { tenantId?: string | null; userId?: string | null };
}

export function withApiLogging<Ctx = unknown>(
  appSlug: string,
  handler: Handler<Ctx>,
  options: WithApiLoggingOptions = {},
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const startedAt = Date.now();
    let response: NextResponse;
    try {
      response = (await handler(req, ctx)) as NextResponse;
    } catch (err) {
      // Re-throw — the route's own error boundary will turn this into a 500.
      // We still log the failure below so analytics captures it.
      const durationMs = Date.now() - startedAt;
      let ctxVals: { tenantId?: string | null; userId?: string | null } = {};
      try {
        ctxVals = options.resolveContext ? await options.resolveContext(req) : {};
      } catch {
        // swallow
      }
      void logApiCall({
        tenantId: ctxVals.tenantId ?? null,
        userId: ctxVals.userId ?? null,
        appSlug,
        method: req.method,
        path: req.nextUrl.pathname,
        statusCode: 500,
        durationMs,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      });
      throw err;
    }

    // Fire-and-forget log on success.
    (async () => {
      try {
        const ctxVals = options.resolveContext ? await options.resolveContext(req) : {};
        void logApiCall({
          tenantId: ctxVals.tenantId ?? null,
          userId: ctxVals.userId ?? null,
          appSlug,
          method: req.method,
          path: req.nextUrl.pathname,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
          ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
        });
      } catch {
        // never let logging break a response
      }
    })();

    return response;
  };
}
