import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { logApiCall } from "@quikit/shared/apiLogging";

/**
 * Context passed to a route handler after the auth + tenant guard succeeds.
 */
export interface TenantAuthContext {
  session: Session;
  userId: string;
  tenantId: string;
}

/**
 * Higher-order wrapper that runs the standard auth + tenantId + error-handling
 * boilerplate around a route handler.
 *
 * Replaces the ~8 lines repeated across 35+ route files:
 *   - session check  → 401
 *   - tenantId check → 403
 *   - try/catch      → 500 with `toErrorMessage`
 *
 * Usage:
 *   export const GET = withTenantAuth(async ({ tenantId }, req) => {
 *     const data = await db.kpi.findMany({ where: { tenantId } });
 *     return NextResponse.json({ success: true, data });
 *   });
 *
 *   // Dynamic route segments still work — pass them through as `params`:
 *   export const GET = withTenantAuth<{ id: string }>(
 *     async ({ tenantId }, req, { params }) => { ... }
 *   );
 */
export interface WithTenantAuthOptions {
  /** Error message used when the handler throws an unhandled exception. */
  fallbackErrorMessage?: string;
  /**
   * FF-1 module gate. When set, the wrapper calls `gateModuleApi` after the
   * auth check — if the tenant has this module (or any ancestor) disabled,
   * the handler is skipped and a 404 is returned. Keeps L3 enforcement in
   * a single place: flip this string on once per route group.
   */
  moduleKey?: string;
}

export function withTenantAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params }
  ) => Promise<NextResponse> | NextResponse,
  options: WithTenantAuthOptions = {}
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let tenantIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        response = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      } else {
        userIdForLog = session.user.id;
        const tenantId = await getTenantId(session.user.id);
        if (!tenantId) {
          response = NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
        } else {
          tenantIdForLog = tenantId;
          if (options.moduleKey) {
            const blocked = await gateModuleApi("quikscale", options.moduleKey, tenantId);
            if (blocked) {
              response = blocked as NextResponse;
            } else {
              response = await handler(
                { session, userId: session.user.id, tenantId },
                req,
                routeCtx ?? ({ params: {} as Params })
              );
            }
          } else {
            response = await handler(
              { session, userId: session.user.id, tenantId },
              req,
              routeCtx ?? ({ params: {} as Params })
            );
          }
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 }
      );
    }

    // SA-A.2: fire-and-forget API call log. Never blocks the response.
    void logApiCall({
      tenantId: tenantIdForLog,
      userId: userIdForLog,
      appSlug: "quikscale",
      method: req.method,
      path: req.nextUrl.pathname,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });

    return response;
  };
}

/**
 * Curry factory for module-gated routes. Use at the top of any route file
 * that belongs to a specific FF-1 module, so every handler in the file
 * inherits the gate:
 *
 *   import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
 *   const withTenantAuth = withTenantAuthForModule("kpi");
 *   export const GET = withTenantAuth(async ({ tenantId }, req) => { ... });
 *   export const POST = withTenantAuth(async ({ tenantId }, req) => { ... });
 *
 * Any existing options (e.g. `fallbackErrorMessage`) still work — moduleKey
 * is merged in as a default but can be overridden per-call.
 */
export function withTenantAuthForModule(moduleKey: string) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withTenantAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) => withTenantAuth<Params>(handler, { moduleKey, ...options });
}
