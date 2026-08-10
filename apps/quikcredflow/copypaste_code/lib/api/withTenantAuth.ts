import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Context passed to a route handler after the auth + tenant guard succeeds.
 *
 * `tenantId` is read directly from the OAuth-issued JWT (the QuikIT IdP stamps
 * it onto `session.user.tenantId` after the user picks an org). No DB lookup
 * needed at request time — that's what makes this fast.
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
 * Replaces the boilerplate repeated across every API route:
 *   - session check  → 401
 *   - tenantId check → 403
 *   - try/catch      → 500 with `{ success: false, error }`
 *
 * Usage:
 *   export const GET = withTenantAuth(async ({ tenantId }, req) => {
 *     const data = await db.crmLead.findMany({ where: { tenantId } });
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
}

export function withTenantAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithTenantAuthOptions = {},
) {
  return async (
    req: NextRequest,
    routeCtx: { params: Params },
  ): Promise<NextResponse> => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      const tenantId = session.user.orgId;
      if (!tenantId) {
        return NextResponse.json(
          { success: false, error: "No active membership" },
          { status: 403 },
        );
      }
      return await handler(
        { session, userId: session.user.id, tenantId },
        req,
        routeCtx ?? ({ params: {} as Params }),
      );
    } catch (error: unknown) {
      const fallback =
        options.fallbackErrorMessage ?? "Operation failed";
      const message = error instanceof Error ? error.message : fallback;
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  };
}

/**
 * Curry factory for module-gated routes (placeholder — feature-gating wires
 * in later via @quikit/auth/feature-gate). Today this just returns
 * `withTenantAuth` so the call signature matches the rest of the monorepo.
 */
export function withTenantAuthForModule(_moduleKey: string | null) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withTenantAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) => withTenantAuth<Params>(handler, options);
}
