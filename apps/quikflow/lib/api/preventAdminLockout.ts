/**
 * Admin self-lockout guard for the dynamic-roles v2 system.
 *
 * Admin permissions are editable like any other role, so a negligent admin
 * could revoke their own access by removing the last admin member from the
 * role. This module refuses any operation that would leave the org's admin
 * role with 0 members.
 *
 * Wire it into:
 *   - `PUT    /api/org/roles/[id]/members` (member reconcile)
 *   - `DELETE /api/org/roles/[id]`         (already blocks isSystem, but
 *                                            also guards member count)
 *
 * Mirrors apps/quikscale/lib/api/preventAdminLockout.ts.
 */
import { db } from "@/lib/db";
import { getQuikFlowAppId } from "@/lib/api/permissions";

export class AdminLockoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminLockoutError";
  }
}

/**
 * Resolve the org's admin AppRole id (`isSystem=true, name="admin"`).
 * Returns `null` when no admin role exists yet. Callers should treat null
 * as "nothing to guard".
 */
async function getAdminRoleId(orgId: string): Promise<string | null> {
  const appId = await getQuikFlowAppId();
  if (!appId) return null;
  const admin = await db.wfAppRole.findFirst({
    where: { orgId, appId, name: "admin", isSystem: true },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Refuse if the set of `nextUserIds` would leave the admin role with 0
 * members. No-op when the role being reconciled is NOT the admin role.
 */
export async function assertReconcileLeavesAdminPopulated(opts: {
  orgId: string;
  roleId: string;
  /** The userIds that the request says SHOULD be on this role after reconcile. */
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
