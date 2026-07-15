import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { logApiCall } from "@quikit/shared/apiLogging";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

/**
 * Context passed to a route handler after the auth + tenant guard succeeds.
 */
export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
  /**
   * True when the caller is an org/super admin — the "App Admin" tier in the
   * PRD role model (§8). Used to gate org-wide workflow operations; members
   * may only touch their own personal workflows.
   */
  isAdmin: boolean;
}

export interface WithOrgAuthOptions {
  /** Error message used when the handler throws an unhandled exception. */
  fallbackErrorMessage?: string;
  /**
   * When true, the caller must be an App Admin (org_admin / super_admin).
   * Non-admins get a 403. Use on routes that create/edit/publish org-wide
   * workflows or manage org connections (PRD FR-E1, FR-F1).
   */
  requireAdmin?: boolean;
}

/**
 * Higher-order wrapper that runs the standard auth + orgId + error-handling
 * boilerplate around a route handler. Mirrors the pattern used across every
 * QuikIT app (see apps/quikscale/lib/api/withOrgAuth.ts), trimmed to what
 * QuikFlow needs (no FF-1 module gate, no RBAC v2 resource registry yet).
 *
 *   - no session            → 401
 *   - no active membership  → 403
 *   - requireAdmin + member → 403
 *   - handler throws         → 500 with `toErrorMessage`
 *
 * Usage:
 *   export const GET = withOrgAuth(async ({ orgId }) => {
 *     const data = await db.wfWorkflow.findMany({ where: { orgId } });
 *     return NextResponse.json({ success: true, data });
 *   });
 */
export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: OrgAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithOrgAuthOptions = {},
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
        const orgId = await getOrgId(session.user.id);
        if (!orgId) {
          response = NextResponse.json(
            { success: false, error: "No active membership" },
            { status: 403 },
          );
        } else {
          orgIdForLog = orgId;
          const isAdmin =
            session.user.isSuperAdmin === true ||
            ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
          if (options.requireAdmin && !isAdmin) {
            response = NextResponse.json(
              { success: false, error: "Admin access required" },
              { status: 403 },
            );
          } else {
            response = await handler(
              { session, userId: session.user.id, orgId, isAdmin },
              req,
              routeCtx ?? ({ params: {} as Params }),
            );
          }
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        {
          success: false,
          error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed"),
        },
        { status: 500 },
      );
    }

    // Fire-and-forget API call log. Never blocks the response.
    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "quikflow",
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
