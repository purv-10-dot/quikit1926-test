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

/**
 * @param isTenantOrg  True when this org has an `LmsTenant` row — i.e. it is a
 *   tenant somebody onboarded, not a root org quikit created. It is what
 *   disambiguates `org_admin`, which is otherwise LOSSY: `toMembershipRole`
 *   (identity-service) squeezes BOTH `ADMIN` and `TENANT_ADMIN` into that single
 *   central value, so reading it back can only guess — and guessing `ADMIN`
 *   silently promoted every tenant admin a tier when this path ran.
 *
 *   Omitted → the historical `ADMIN` answer, so no caller changes behaviour by
 *   not passing it.
 */
export function mapPlatformRoleToLmsRole(
  membershipRole: string | undefined,
  isSuperAdmin?: boolean,
  isTenantOrg?: boolean,
): UserRole {
  // The platform operator gets the top LMS tier so the console is usable. Note
  // this is the ONLY thing the claim does here — the cross-tenant data access it
  // also grants is decided in `tenantWhere` / `assertTenantMatch`, off the same
  // claim and never off the role this function returns.
  if (isSuperAdmin) return "ADMIN";

  const r = (membershipRole ?? "").toLowerCase().replace(/[-\s]/g, "_");
  switch (r) {
    // Every `org_admin` gets the top LMS tier — quikscale parity (`org_admin`
    // clears the admin bar on its own there too, with no "who was first"
    // concept). QuikIT's invite form (`POST /api/super/orgs/[id]/members`)
    // offers only `org_admin | member`, so ADMIN is what every person a
    // platform admin invites to administer an org — first or fifth — arrives
    // as. This used to depend on a "founding admin" fact (was this the
    // earliest admin-tier OrgMember row?) so only the org's first invite got
    // ADMIN and later ones got TENANT_ADMIN; that distinction is gone (removed
    // 2026-08-04) — every org_admin is ADMIN now.
    //
    // WHY THIS IS NOT THE OLD CROSS-TENANT LEAK. `tenantWhere`,
    // `assertTenantMatch`, `requireFeature` and the `/api/users*` +
    // `/api/tenants/*` handlers all key their scoping on the platform operator
    // claim `isSuperAdmin`, which only apps/quikit's audited super-admin
    // console can set and which is checked above — never on this ROLE. ADMIN
    // decides which dashboard, nav and page guards a user gets; `isSuperAdmin`
    // decides what data they can read, and an ADMIN's stays filtered to
    // `orgId` regardless of how many other ADMINs exist in other orgs.
    //
    // The one place ADMIN is NOT automatically unscoped: the shared
    // master-course catalog's approve/reject/publish/archive/duplicate
    // actions. With every org_admin now ADMIN (not just one founder per org),
    // `assertCanActOnGlobalCourse` (lib/services/master-course-service.ts)
    // restricts a non-operator ADMIN to courses submitted by their OWN org —
    // added in the same change, because without it any org's ADMIN could act
    // on any other org's submitted course.
    //
    // A school/corporate tenant's own first admin does NOT reach this branch:
    // `onboardTenant` provisions them with an explicit TENANT_ADMIN assignment, and
    // `getAssignedLmsRole` wins over this fallback in `resolveLmsRoles`. This fires
    // only for someone with no assignment and no LMS row yet — the person quikit
    // invited to run the org.
    case "org_admin":
    case "owner":
    case "administrator":
      // A tenant's own admin is TENANT_ADMIN, never ADMIN. Both were stored as
      // `org_admin`, so the org itself is the only thing that separates them: a
      // tenant org has an `LmsTenant` row, a root org does not. Without this the
      // round-trip TENANT_ADMIN → org_admin → ADMIN handed a tenant admin the top
      // tier — including the shared-catalog approve/reject powers guarded by
      // `assertCanActOnGlobalCourse`.
      return isTenantOrg ? "TENANT_ADMIN" : "ADMIN";
    // Retained separately: an explicit `super_admin` MEMBERSHIP role is a
    // deliberate statement, unlike the `org_admin` inference above. This is the
    // central `OrgMember.role` STRING, not an LMS role — QuikLMS no longer has a
    // role by that name, but quikit still issues the membership value.
    case "super_admin":
      return "ADMIN";
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
