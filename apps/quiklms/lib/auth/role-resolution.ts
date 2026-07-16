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
import type { LmsUserRole as UserRole } from "@prisma/client";

export function mapPlatformRoleToLmsRole(
  membershipRole: string | undefined,
  isSuperAdmin?: boolean,
  /**
   * True when the user's org has a QuikLMS `Tenant` row. This is the ONLY
   * signal that distinguishes the platform operator (whose org has no Tenant
   * row) from a school/corporate tenant admin (whose org does) — both carry
   * the same coarse platform role `org_admin`. Callers that can resolve the
   * Tenant row (getAuthContext / resolveLmsRole) MUST pass it so an admin-tier
   * member of a real tenant is never mislabeled as the operator.
   */
  belongsToTenantOrg?: boolean,
): UserRole {
  if (isSuperAdmin) return "SUPER_ADMIN";

  const r = (membershipRole ?? "").toLowerCase().replace(/[-\s]/g, "_");
  switch (r) {
    // The platform `org_admin` is shared by TWO very different actors:
    //   - the QuikLMS *operator* — first member of the operator org, which has
    //     NO `Tenant` row → SUPER_ADMIN.
    //   - a school/corporate *tenant admin* — first member of a tenant org,
    //     which DOES have a `Tenant` row → TENANT_ADMIN.
    // A tenant admin normally has an LMS `User` row (so getAuthContext reads it
    // directly), but there's a window — right after onboarding, before the LMS
    // row resolves, or when the LMS DB read misses — where this coarse fallback
    // runs. Without the Tenant-row check it defaulted every `org_admin` to
    // SUPER_ADMIN, dumping freshly-onboarded school admins on the super-admin
    // portal. Gate on `belongsToTenantOrg` so that can't happen.
    case "super_admin":
    case "org_admin":
    case "owner":
    case "administrator":
      return belongsToTenantOrg ? "TENANT_ADMIN" : "SUPER_ADMIN";
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
