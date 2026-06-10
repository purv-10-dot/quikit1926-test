import type { SessionUser } from "@/types/permission";

const CRM_ADMIN_ROLES = new Set([
  "administrator",
  "org_admin",
  "app_admin",
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
