/**
 * Platform role → LMS role adapter.
 *
 * The QuikIT session carries a coarse membership role (`super_admin`,
 * `org_admin`, `app_admin`, `member`) plus the `isSuperAdmin` flag. QuikLMS's
 * own authorization is keyed on the 7-value `UserRole` enum. This maps between
 * them so the ~335 files that read `AuthUser.role` keep working unchanged.
 *
 * Fine-grained per-app roles (a `UserAppAccess.role` / `AppRole.name` override,
 * quikcrm-style) arrive with Phase 4 registration; until then we map from the
 * membership role alone and default to least privilege (LEARNER).
 */
import type { UserRole } from "@prisma/client";

export function mapPlatformRoleToLmsRole(
  membershipRole: string | undefined,
  isSuperAdmin?: boolean,
): UserRole {
  if (isSuperAdmin) return "SUPER_ADMIN";

  const r = (membershipRole ?? "").toLowerCase().replace(/[-\s]/g, "_");
  switch (r) {
    // The platform `org_admin` is the QuikLMS *operator* — the first member of
    // an org (seeded by apps/quikit `POST /api/super/orgs`) who has no LMS
    // `User` row yet. QuikLMS's operator tier is SUPER_ADMIN: they onboard the
    // school/corporate tenants (each its own Org) and each of those gets a
    // `TENANT_ADMIN` who DOES have an LMS row, so `getAuthContext` reads that
    // row directly and this coarse fallback never mislabels them.
    case "super_admin":
    case "org_admin":
    case "owner":
    case "administrator":
      return "SUPER_ADMIN";
    case "admin":
    case "tenant_admin":
      return "TENANT_ADMIN";
    case "app_admin":
    case "sub_admin":
      return "SUB_ADMIN";
    case "manager":
      return "MANAGER";
    case "teacher":
    case "instructor":
      return "TEACHER";
    case "parent":
      return "PARENT";
    case "learner":
    case "student":
    case "member":
      return "LEARNER";
    default:
      return "LEARNER";
  }
}
