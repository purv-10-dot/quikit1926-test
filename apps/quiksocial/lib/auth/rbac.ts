/**
 * RBAC helpers for per-workspace role checks.
 *
 * Roles live in `app_quiksocial.BrandMembership` (one row per
 * userId + brandId). A user can be admin in one brand and member in
 * another.
 *
 * Backward compat: if no BrandMembership record exists for
 * (userId, brandId) but the user is the brand creator
 * (Brand.createdBy === userId), treat them as admin. This is the path
 * that lets brands keep working without an explicit creator-membership
 * row written at brand-create time.
 *
 * Ported to QuikIT (Phase 3, Batch 2). All helpers now take `orgId` as
 * a parameter — pulled from the real session via withOrgAuth — instead
 * of relying on the legacy DEFAULT_TENANT_ID constant.
 */

import { db } from "@/lib/db";

export type WorkspaceRole = "admin" | "member" | "approver";

/**
 * Get the user's role for a specific brand workspace.
 * Returns null when the user has no access to the brand.
 */
export async function getWorkspaceRole(
  orgId: string,
  userId: string,
  brandId: string,
): Promise<WorkspaceRole | null> {
  if (!orgId || !userId || !brandId) return null;

  const record = await db.brandMembership.findFirst({
    where: { orgId, userId, brandId },
    select: { role: true },
  });

  if (record?.role) {
    return record.role as WorkspaceRole;
  }

  // Backward compat — brand creator with no BrandMembership row is admin.
  const brand = await db.brand.findFirst({
    where: { orgId, id: brandId },
    select: { createdBy: true },
  });
  if (brand?.createdBy && brand.createdBy === userId) {
    return "admin";
  }

  return null;
}

/** Admin or approver — both can approve / schedule / publish. */
export async function isAdminInBrand(
  orgId: string,
  userId: string,
  brandId: string,
): Promise<boolean> {
  const role = await getWorkspaceRole(orgId, userId, brandId);
  return role === "admin" || role === "approver";
}

/** Strict member (non-admin, non-approver). */
export async function isMemberInBrand(
  orgId: string,
  userId: string,
  brandId: string,
): Promise<boolean> {
  const role = await getWorkspaceRole(orgId, userId, brandId);
  return role === "member";
}

/** Returns true when the user has any role assignment for the brand. */
export async function hasAccessToBrand(
  orgId: string,
  userId: string,
  brandId: string,
): Promise<boolean> {
  const role = await getWorkspaceRole(orgId, userId, brandId);
  return role !== null;
}
