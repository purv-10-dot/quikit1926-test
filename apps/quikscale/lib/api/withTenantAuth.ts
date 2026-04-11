import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";

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
export function withTenantAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params }
  ) => Promise<NextResponse> | NextResponse,
  options: { fallbackErrorMessage?: string } = {}
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }

      const tenantId = await getTenantId(session.user.id);
      if (!tenantId) {
        return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
      }

      return await handler(
        { session, userId: session.user.id, tenantId },
        req,
        routeCtx ?? ({ params: {} as Params })
      );
    } catch (error: unknown) {
      return NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 }
      );
    }
  };
}
