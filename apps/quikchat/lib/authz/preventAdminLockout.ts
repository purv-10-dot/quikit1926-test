/**
 * Admin self-lockout guard for QuikChat RBAC v2 (ported from
 * apps/quikscale/lib/api/preventAdminLockout.ts, adapted to db.qcAppRole /
 * db.qcUserAppRole + getQuikChatAppId, lowercase "admin" system role).
 *
 * The v2 model has no `isSystem` bypass on the admin role — grants are
 * editable. Two ways an admin could revoke their own access:
 *   (a) un-check every permission on the admin role — behaves like a no-grants
 *       role; not guarded here (the matrix warns).
 *   (b) remove the last admin MEMBER — that's what this module blocks.
 *
 * Wired into:
 *   - PUT    /api/org/roles/[id]/members  (reconcile)  → assertReconcileLeavesAdminPopulated
 *   - DELETE /api/org/roles/[id]          (role delete) → assertRoleDeletable
 */
import { db } from "@/lib/db";
import { getQuikChatAppId } from "./permissions";

export class AdminLockoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminLockoutError";
  }
}

/** Resolve the org's admin QcAppRole id (isSystem=true, name="admin"), or null. */
async function getAdminRoleId(orgId: string): Promise<string | null> {
  const appId = await getQuikChatAppId();
  if (!appId) return null;
  const admin = await db.qcAppRole.findFirst({
    where: { orgId, appId, name: "admin", isSystem: true },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Refuse if the reconciled member set would leave the admin role empty. No-op
 * when the role being reconciled is NOT the admin role.
 */
export async function assertReconcileLeavesAdminPopulated(opts: {
  orgId: string;
  roleId: string;
  nextUserIds: string[];
}): Promise<void> {
  const adminRoleId = await getAdminRoleId(opts.orgId);
  if (!adminRoleId || adminRoleId !== opts.roleId) return;
  if (opts.nextUserIds.length === 0) {
    throw new AdminLockoutError(
      "Cannot reconcile the admin role to an empty member list. Keep at least one administrator.",
    );
  }
}

/**
 * Refuse role deletion when the role is a system role. Returns the count of
 * members that would lose access, so the caller can surface it. (The route
 * also blocks isSystem independently; this re-enforces defensively and reports
 * the member count.)
 */
export async function assertRoleDeletable(opts: {
  orgId: string;
  roleId: string;
}): Promise<{ memberCount: number }> {
  const role = await db.qcAppRole.findUnique({
    where: { id: opts.roleId },
    select: { isSystem: true, name: true, orgId: true },
  });
  if (!role || role.orgId !== opts.orgId) {
    throw new AdminLockoutError("Role not found in this organization.");
  }
  if (role.isSystem) {
    throw new AdminLockoutError("Cannot delete a system role.");
  }
  const memberCount = await db.qcUserAppRole.count({ where: { roleId: opts.roleId } });
  return { memberCount };
}
