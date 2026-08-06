import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertModule } from "@/lib/auth/permissions";
import { mapMembershipToCrmRole } from "@/lib/auth/require";
import type { ModuleAction, SessionUser } from "@/types/permission";

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
      const fallback = options.fallbackErrorMessage ?? "Operation failed";
      const err = error as { statusCode?: number };
      const status =
        typeof err?.statusCode === "number" && Number.isInteger(err.statusCode)
          ? err.statusCode
          : 500;
      // 4xx errors (e.g. a 403 from a permission gate) carry a safe, intentional
      // message; 5xx must not leak internal error text to the client.
      if (status >= 500) {
        console.error("[withTenantAuth]", error);
        return NextResponse.json({ success: false, error: fallback }, { status });
      }
      const message = error instanceof Error ? error.message : fallback;
      return NextResponse.json({ success: false, error: message }, { status });
    }
  };
}

const METHOD_ACTION: Record<string, ModuleAction> = {
  GET: "view",
  HEAD: "view",
  POST: "create",
  PUT: "edit",
  PATCH: "edit",
  DELETE: "delete",
};

/**
 * Curry factory for module-gated routes: runs `assertModule(user, moduleKey,
 * <action for the HTTP method>)` before the handler, on top of the standard
 * auth + tenant guard. Pass `null` to skip module gating (auth + tenant only).
 *
 * NOTE: the role here comes from the session JWT (this wrapper deliberately
 * avoids a per-request DB lookup). For surfaces where immediate reaction to
 * role changes matters, prefer the `requireApiUser()` + `assertModule()` path,
 * which re-validates membership against the DB on every request.
 */
export function withTenantAuthForModule(moduleKey: string | null) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withTenantAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) =>
    withTenantAuth<Params>(async (ctx, req, routeCtx) => {
      if (moduleKey) {
        const action = METHOD_ACTION[(req.method ?? "GET").toUpperCase()] ?? "view";
        const user: SessionUser = {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          role: mapMembershipToCrmRole(ctx.session.user?.membershipRole),
          email: ctx.session.user?.email ?? "",
          name: ctx.session.user?.name ?? "",
        };
        await assertModule(user, moduleKey, action);
      }
      return handler(ctx, req, routeCtx);
    }, options);
}
