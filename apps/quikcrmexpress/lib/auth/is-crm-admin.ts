import type { SessionUser } from "@/types/permission";

// Mirrors ADMIN_TIER_ROLES in @quikit/shared ({super_admin, org_admin, admin})
// plus this app's local synonyms. `app_admin` is excluded deliberately — the
// platform ranks it below admin and leaves it out of ADMIN_TIER_ROLES, so
// treating it as an admin here granted executive-overview access the platform
// never intended. Kept in sync with mapRole() in lib/auth/require.ts.
const CRM_ADMIN_ROLES = new Set([
  "administrator",
  "org_admin",
  "super_admin",
  "admin",
  "owner",
]);

/** Platform org admin or CRM Administrator — executive overview access. */
export function isCrmAdmin(role: string | undefined | null): boolean {
  if (!role) return false;
  return CRM_ADMIN_ROLES.has(role.toLowerCase());
}

export function isCrmAdminUser(user: Pick<SessionUser, "role">): boolean {
  return isCrmAdmin(user.role);
}
