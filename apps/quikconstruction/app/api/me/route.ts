import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";

/**
 * GET /api/me
 *
 * Returns the current tenant context for the authenticated user — used by
 * the client to bootstrap the permission gate hook (`usePermissions`).
 *
 * Response shape:
 *   {
 *     userId, userEmail, userName, tenantId, orgId, roleKey,
 *     permissions: string[],   // flat list (wildcard "*" materialized server-side)
 *     projectIds?: string[]    // when user is project-scoped
 *   }
 *
 * 401 if not authenticated.
 */
export async function GET() {
  try {
    const ctxOrResponse = await requireAuth();
    if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
    const ctx = ctxOrResponse;

    return NextResponse.json({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      userName: ctx.userName,
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      roleKey: ctx.roleKey,
      userType: ctx.userType,
      permissions: Array.from(ctx.permissions),
      projectIds: ctx.projectIds ?? null,
      modulesAssigned: ctx.modulesAssigned,
      permissionMatrix: ctx.permissionMatrix,
    });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[me.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
