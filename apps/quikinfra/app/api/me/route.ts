import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";
import { buildMatrixFromModules, stripDeniedRows } from "@/lib/rbac/menu-catalog";

/**
 * GET /api/me
 *
 * Returns the current tenant context for the authenticated user — used by
 * the client to bootstrap the permission gate hook (`usePermissions`).
 *
 * Response shape:
 *   {
 *     userId, userEmail, userName, orgId, roleKey,
 *     permissions: string[],   // flat list (wildcard "*" materialized server-side)
 *     projectIds?: string[]    // when user is project-scoped
 *   }
 *
 * 401 if not authenticated.
 */
export async function GET() {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  // If no matrix has been saved yet for this user, derive one from their
  // assigned modules so the payload reflects the effective rights the UI
  // actually enforces. Admins / wildcard holders still get null.
  const effectiveMatrix =
    ctx.permissionMatrix ??
    (ctx.modulesAssigned ? buildMatrixFromModules(ctx.modulesAssigned) : null);

  return NextResponse.json({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    userName: ctx.userName,
    orgId: ctx.orgId,
    roleKey: ctx.roleKey,
    userType: ctx.userType,
    permissions: Array.from(ctx.permissions),
    projectIds: ctx.projectIds ?? null,
    modulesAssigned: ctx.modulesAssigned,
    permissionMatrix: stripDeniedRows(
      effectiveMatrix as Record<string, Record<string, boolean>> | null,
    ),
  });
}
