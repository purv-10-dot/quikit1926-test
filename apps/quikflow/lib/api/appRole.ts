import { isOrgAdmin } from "@/lib/api/permissions";

/**
 * QuikFlow now owns its own dynamic-RBAC v2 role assignments
 * (`app_quikflow.AppRole` / `UserAppRole` / `RolePermission`, seeded by
 * `@/lib/api/seedAdminAppRole`). This used to borrow QuikScale's admin
 * grant as a stand-in before QuikFlow had roles of its own — kept as a
 * thin re-export so existing `isOrgAppAdmin` callers (withOrgAuth) don't
 * need to change.
 */
export async function isOrgAppAdmin(userId: string, orgId: string): Promise<boolean> {
  return isOrgAdmin(userId, orgId);
}
