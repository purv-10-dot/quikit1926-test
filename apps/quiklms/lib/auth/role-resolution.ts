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
   * True when this user is the FOUNDING admin of their org — the earliest
   * admin-tier `OrgMember` row (see lib/auth/founding-admin.ts). Callers that can
   * resolve it (`getAuthContext`, `resolveLmsRoles`) pass it; callers that cannot
   * omit it and every `org_admin` stays `TENANT_ADMIN`.
   *
   * This parameter replaces `belongsToTenantOrg`, which inferred the platform
   * operator from the ABSENCE of an `app_quiklms.tenants` row. That inference was
   * wrong in both directions — an org provisioned by the launcher or the admin
   * portal has no tenants row either — so ordinary tenant admins were labelled
   * SUPER_ADMIN. "Is this the org's first admin?" is a fact, not a guess.
   */
  isFoundingOrgAdmin?: boolean,
): UserRole {
  if (isSuperAdmin) return "SUPER_ADMIN";

  const r = (membershipRole ?? "").toLowerCase().replace(/[-\s]/g, "_");
  switch (r) {
    // The FOUNDING admin of an org gets the top tier; every later `org_admin`
    // gets TENANT_ADMIN.
    //
    // QuikIT's invite form (`POST /api/super/orgs/[id]/members`) offers only
    // `org_admin | member`, so the admin a platform admin invites to run a NEW org
    // arrives indistinguishable from the org's fifth admin. Both landed on
    // `/tenant-dashboard` — the corporate tenant-admin dashboard — which is the
    // "logged in as corporate admin, expected admin" report this branch answers.
    //
    // WHY THIS IS NOT THE OLD CROSS-TENANT LEAK. The previous version of this
    // branch read `belongsToTenantOrg ? "TENANT_ADMIN" : "SUPER_ADMIN"`, and back
    // then `tenantWhere()` keyed unscoped reads on the ROLE:
    //
    //     if (user.role === 'SUPER_ADMIN') return extra;   // every tenant's rows
    //
    // so anything that made `role` resolve to SUPER_ADMIN also handed out every
    // tenant's data. That is no longer true: `tenantWhere`, `assertTenantMatch`,
    // `requireFeature` and the `/api/users*` + `/api/tenants/*` handlers all key
    // their scoping on the platform operator claim `isSuperAdmin`, which only
    // apps/quikit's audited super-admin console can set and which is checked above.
    // A founding admin is therefore the top admin OF THEIR OWN ORG: SUPER_ADMIN
    // decides which dashboard, nav and page guards they get; `isSuperAdmin` decides
    // what data they can read, and theirs stays filtered to `orgId`.
    case "org_admin":
    case "owner":
    case "administrator":
      return isFoundingOrgAdmin ? "SUPER_ADMIN" : "TENANT_ADMIN";
    // Retained separately: an explicit `super_admin` MEMBERSHIP role is a
    // deliberate statement, unlike the `org_admin` inference above.
    case "super_admin":
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
