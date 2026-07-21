import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { userCan, forbidden } from "@/lib/api/permissions";
import { isRemovedFromQuikAsset } from "@/lib/api/removal";
import type { Resource, Action } from "@/lib/api/permissionsRegistry";

/** Context passed to a handler after auth + tenant + (optional) permission gate. */
export interface TenantAuthContext {
  session: Session;
  userId: string;
  userEmail: string | null;
  orgId: string;
}

export interface WithOrgAuthOptions {
  fallbackErrorMessage?: string;
  /** RBAC v2 gate — when set, `userCan(userId, orgId, resource, action)` must pass. */
  permission?: { resource: Resource; action: Action };
}

/**
 * Higher-order wrapper running the standard auth + orgId + error boilerplate
 * around every tenant-scoped route handler:
 *   - no session                  → 401
 *   - no active membership/access  → 403
 *   - missing RBAC permission      → 403
 *   - unhandled throw              → 500 (toErrorMessage)
 *
 * Usage:
 *   export const GET = withOrgAuth(async ({ orgId }) => { ... });
 *   export const POST = withOrgAuth(
 *     async ({ orgId, userId }, req) => { ... },
 *     { permission: { resource: "Asset", action: "create" } },
 *   );
 */
export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
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
      const userId = session.user.id;
      const orgId = await getOrgId(userId);
      if (!orgId) {
        return NextResponse.json(
          { success: false, error: "No active membership / app access" },
          { status: 403 },
        );
      }
      // Soft-removed users are denied all QuikAsset access (data is retained).
      if (await isRemovedFromQuikAsset(userId, orgId)) {
        return NextResponse.json(
          { success: false, error: "Your access to QuikAsset has been removed." },
          { status: 403 },
        );
      }
      if (options.permission) {
        const allowed = await userCan(userId, orgId, options.permission.resource, options.permission.action);
        if (!allowed) return forbidden();
      }
      return await handler(
        { session, userId, userEmail: session.user.email ?? null, orgId },
        req,
        routeCtx ?? ({ params: {} as Params }),
      );
    } catch (error: unknown) {
      return NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 },
      );
    }
  };
}

/**
 * Per-resource curry factory. Each verb-bound wrapper hard-codes the RBAC
 * action so route files don't repeat it:
 *
 *   const auth = withOrgAuthForResource("Asset");
 *   export const GET    = auth.view(async ({ orgId }) => { ... });
 *   export const POST   = auth.create(async ({ orgId }, req) => { ... });
 *   export const PUT    = auth.update(async ({ orgId }, req, { params }) => { ... });
 *   export const DELETE = auth.delete(async ({ orgId }, req, { params }) => { ... });
 */
export function withOrgAuthForResource(resource: Resource) {
  const wrap = (action: Action) =>
    <Params = Record<string, never>>(
      handler: Parameters<typeof withOrgAuth<Params>>[0],
      options: WithOrgAuthOptions = {},
    ) => withOrgAuth<Params>(handler, { permission: { resource, action }, ...options });
  return {
    view: wrap("view"),
    create: wrap("create"),
    update: wrap("update"),
    delete: wrap("delete"),
  };
}
