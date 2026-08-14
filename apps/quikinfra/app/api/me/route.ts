import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";
import { stripDeniedRows } from "@/lib/rbac/menu-catalog";
import {
  buildMatrixFromPermissions,
  intersectMatrices,
} from "@/lib/rbac/matrixV2Bridge";

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

  // Derive the matrix from the user's effective permission set so the payload
  // reflects the rights the route guards actually enforce. The previous
  // module-based derivation only asked "is this module assigned?" and then
  // granted the FULL add/edit/delete/view set, so a role holding just
  // view+create still rendered Add / Edit / Delete buttons.
  //
  // A saved (revoke-derived) matrix is intersected rather than preferred:
  // taking it alone would drop the permission-derived denials for any user who
  // happens to carry an unrelated revoke row.
  //
  // Admins keep `modulesAssigned === null` → null matrix → unrestricted.
  const derivedMatrix = ctx.modulesAssigned
    ? buildMatrixFromPermissions(ctx.permissions)
    : null;
  const effectiveMatrix = derivedMatrix
    ? (ctx.permissionMatrix
        ? intersectMatrices(derivedMatrix, ctx.permissionMatrix)
        : derivedMatrix)
    : ctx.permissionMatrix;

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
