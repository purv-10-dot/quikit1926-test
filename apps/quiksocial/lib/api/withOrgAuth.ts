import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";

/**
 * Context passed to a route handler after the auth + orgId guard succeeds.
 */
export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithOrgAuthOptions {
  /** Error message used when the handler throws an unhandled exception. */
  fallbackErrorMessage?: string;
}

/**
 * Higher-order wrapper that runs the standard auth + orgId + error-handling
 * boilerplate around a route handler. Mirrors the quikscale implementation
 * so QuikSocial routes match the cross-app pattern.
 *
 *   - session check  → 401
 *   - orgId check    → 403
 *   - try/catch      → 500 with `toErrorMessage`
 *
 * Usage:
 *   export const GET = withOrgAuth(async ({ orgId }, req) => {
 *     const data = await db.brand.findMany({ where: { orgId } });
 *     return NextResponse.json({ success: true, data });
 *   });
 *
 *   // Dynamic route segments still work — pass them through as `params`:
 *   export const GET = withOrgAuth<{ id: string }>(
 *     async ({ orgId }, req, { params }) => { ... }
 *   );
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
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      const orgId = await getOrgId(session.user.id);
      if (!orgId) {
        return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
      }
      return await handler(
        { session, userId: session.user.id, orgId },
        req,
        routeCtx ?? ({ params: {} as Params }),
      );
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed"),
        },
        { status: 500 },
      );
    }
  };
}
