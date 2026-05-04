import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { logApiCall } from "@quikit/shared/apiLogging";

/**
 * withOrgAuth — lifted from apps/quikscale and scoped to `quikconstruction`.
 *
 * Provides: session check → orgId resolution → optional module feature gate
 * → try/catch with friendly 500 → fire-and-forget API call log.
 *
 * Use the curried `withOrgAuthForModule("masters")` at the top of each
 * route file so FF-1 gating inherits through every handler in the file.
 */
export interface TenantAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithTenantAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithTenantAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        response = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      } else {
        userIdForLog = session.user.id;
        const orgId = await getTenantId(session.user.id);
        if (!orgId) {
          response = NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
        } else {
          orgIdForLog = orgId;
          if (options.moduleKey) {
            const blocked = await gateModuleApi("quikconstruction", options.moduleKey, orgId);
            if (blocked) {
              response = blocked as NextResponse;
            } else {
              response = await handler(
                { session, userId: session.user.id, orgId },
                req,
                routeCtx ?? ({ params: {} as Params }),
              );
            }
          } else {
            response = await handler(
              { session, userId: session.user.id, orgId },
              req,
              routeCtx ?? ({ params: {} as Params }),
            );
          }
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 },
      );
    }

    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "quikconstruction",
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

export function withOrgAuthForModule(moduleKey: string) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) => withOrgAuth<Params>(handler, { moduleKey, ...options });
}
