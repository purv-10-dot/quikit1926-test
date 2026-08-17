/**
 * QuikLMS RBAC seeder — the LMS equivalent of quikscale's
 * `lib/api/seedAdminAppRole.ts` / quikcrm's `seed-crm-app-roles.ts`.
 *
 * Writes this org's default `app_quiklms.AppRole` rows (the `LmsAppRole`
 * model) so that:
 *   • the Admin Portal's "Roles per Application" dropdown lists them
 *     (GET apps/admin/app/api/roles?appSlug=quiklms reads app_quiklms."AppRole"),
 *   • the central `assignAppRoles()` flow (packages/auth/assign-app-roles.ts)
 *     can resolve a role by name and write app_quiklms."UserAppRole", and
 *   • quiklms can resolve the assigned role at runtime (see lib/auth/app-role.ts).
 *
 * QuikLMS's "app roles" ARE its seven `LmsUserRole` enum values. Six role names
 * equal their enum value so consumption maps name → enum directly; the seventh,
 * the top tier, is the platform-standard `admin` row and maps to `ADMIN` (see
 * `lmsRoleToAppRoleName` below and ROLE_NAME_TO_ENUM in lib/auth/app-role.ts).
 * QuikLMS authorises off the coarse role enum (requireRoles), not resource/action
 * grants, so — unlike quikscale — no RolePermission rows are seeded; the AppRole
 * rows are the named-role catalogue the platform assignment flow needs.
 *
 * Idempotent: upserts on the `@@unique([orgId, appId, name])` key. A small
 * per-process cache skips repeat seeding within a run.
 */
import type { LmsUserRole } from '@prisma/client';
import { mirrorAppRoleToCentral } from '@quikit/auth/assign-app-roles';
import { db } from '@/lib/db';

const QUIKLMS_SLUG = 'quiklms';

/**
 * The platform-standard system role every QuikIT app exposes (quikscale,
 * quikinfra, … all seed a single `admin`). It is the ONLY role flagged
 * `isSystem: true`, so it is the one the Admin Portal lists under "System
 * Roles"; every app-specific tier is a Custom Role.
 *
 * In QuikLMS `admin` is the TOP tier — the org's founding administrator, who
 * onboards school/corporate tenants. It resolves to `ADMIN` at runtime (see
 * lib/auth/app-role.ts), mirroring quikscale where `admin` is the full-access
 * role. It formerly resolved to `TENANT_ADMIN` while a separate `SUPER_ADMIN`
 * role held the top tier; that role is gone and this one absorbed it.
 */
export const LMS_SYSTEM_ADMIN_ROLE = 'admin';

interface LmsRoleSpec {
  /** `LMS_SYSTEM_ADMIN_ROLE` ("admin") or one of the `LmsUserRole` enum names. */
  name: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
}

/**
 * QuikLMS's role catalogue, matching the platform convention:
 *   - exactly ONE `isSystem: true` role — `admin` — shown under "System Roles",
 *     and in QuikLMS it is also the TOP tier;
 *   - every lower tier is a Custom Role (`isSystem: false`), names === the
 *     `LmsUserRole` enum so consumption maps name → enum directly;
 *   - `LEARNER` is the least-privilege `isDefault` auto-assign role.
 * Ordered admin-first so it surfaces at the top (the Admin Portal also orders
 * `isSystem DESC`).
 *
 * Seven rows, one per `LmsUserRole` value — `admin` covers `ADMIN`. There is no
 * `SUPER_ADMIN` row: it was a duplicate top tier whose name collided with the
 * unrelated `isSuperAdmin` platform claim, and `admin` absorbed it.
 */
export const LMS_APP_ROLES: readonly LmsRoleSpec[] = [
  { name: LMS_SYSTEM_ADMIN_ROLE, description: 'Full organization access — auto-seeded platform system role. Onboards school and corporate tenants.', isSystem: true, isDefault: false },
  { name: 'TENANT_ADMIN', description: 'School / corporate administrator — full access within their organization.', isSystem: false, isDefault: false },
  { name: 'SUB_ADMIN', description: 'Delegated administrator with a limited scope.', isSystem: false, isDefault: false },
  { name: 'MANAGER', description: 'Manages teams, courses, batches and reporting.', isSystem: false, isDefault: false },
  { name: 'TEACHER', description: 'Delivers courses, batches, assessments and grading.', isSystem: false, isDefault: false },
  { name: 'PARENT', description: 'Parent / guardian portal access.', isSystem: false, isDefault: false },
  { name: 'LEARNER', description: 'Default learner access.', isSystem: false, isDefault: true },
] as const;

/** Per-process "already seeded this org" cache — mirrors the reference seeders. */
const seededOrgs = new Set<string>();
let cachedAppId: string | null | undefined;

/** Resolve (and cache) the central `App.id` for the quiklms slug. */
async function getQuikLmsAppId(): Promise<string | null> {
  if (cachedAppId !== undefined) return cachedAppId ?? null;
  const app = await db.app.findFirst({ where: { slug: QUIKLMS_SLUG }, select: { id: true } });
  cachedAppId = app?.id ?? null;
  return cachedAppId;
}

/**
 * Seed the org's default LMS AppRole rows. Returns a `name → roleId` map (empty
 * when the quiklms App row is missing — nothing to seed against yet).
 */
export async function seedLmsAppRoles(orgId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!orgId) return out;

  const appId = await getQuikLmsAppId();
  if (!appId) return out;

  for (const spec of LMS_APP_ROLES) {
    const row = await db.lmsAppRole.upsert({
      where: { orgId_appId_name: { orgId, appId, name: spec.name } },
      update: { description: spec.description, isSystem: spec.isSystem, isDefault: spec.isDefault },
      create: {
        orgId,
        appId,
        name: spec.name,
        description: spec.description,
        isSystem: spec.isSystem,
        isDefault: spec.isDefault,
      },
      select: { id: true, name: true },
    });
    out.set(row.name, row.id);
  }

  seededOrgs.add(orgId);
  return out;
}

/** Cached variant — seeds at most once per org per process. */
export async function ensureLmsAppRolesSeeded(orgId: string): Promise<void> {
  if (!orgId || seededOrgs.has(orgId)) return;
  await seedLmsAppRoles(orgId);
}

/**
 * The catalogue row NAME that backs an `LmsUserRole` value — the inverse of
 * `ROLE_NAME_TO_ENUM` in lib/auth/app-role.ts.
 *
 * Every tier is named after its enum value EXCEPT the top one: the enum says
 * `ADMIN`, the catalogue row says `admin` (the platform-wide `isSystem` role name
 * every QuikIT app seeds). Without this indirection `roles.get('ADMIN')` misses —
 * there is no row by that name — and `ensureUserOnLmsRole` would silently no-op
 * on exactly the role that matters most.
 */
export function lmsRoleToAppRoleName(role: LmsUserRole): string {
  return role === 'ADMIN' ? LMS_SYSTEM_ADMIN_ROLE : role;
}

/** Per-process guard so the mirror below is one write per user, not one per page load. */
const mirroredUsers = new Set<string>();

/**
 * Re-point the CENTRAL `UserAppAccess.role` copy at this user's real LMS role.
 *
 * TODO(integration): the real fix belongs in `apps/quikit`. Its invitation-accept
 * handler decides the central role with
 *
 *     membership.role === MEMBERSHIP_ROLES.APP_ADMIN ? "admin" : "member"
 *
 * which never matches `org_admin` — the role quikit's own create-org flow assigns.
 * So an organisation's top-tier admin is written to `UserAppAccess` as `member`.
 * `ensureUserOnLmsRole` already mirrors the correct name, but it runs at
 * provisioning time, BEFORE the invitation is accepted and therefore before the
 * `UserAppAccess` row exists — and `mirrorAppRoleToCentral` is an `updateMany`, so
 * it silently matches nothing. Acceptance then creates the row as `member`, and
 * nothing corrects it. Observed on a real org admin whose LMS role was `admin`
 * while the Admin Portal displayed `member`.
 *
 * This is a LOCAL correction, not the fix: it runs after acceptance (from
 * `GET /api/me`), when the row does exist, so the update lands.
 *
 * DISPLAY ONLY — deliberately. It touches the denormalised central copy and
 * nothing else. Authorization reads `app_quiklms.UserAppRole`, which was already
 * correct; that table is not written here. And it never CREATES an assignment: a
 * user with no `UserAppRole` row keeps resolving through the grant fallback rather
 * than having a role persisted for them off a derived value.
 */
export async function syncCentralAppRoleMirror(
  userId: string,
  orgId: string,
  roleName: LmsUserRole,
): Promise<void> {
  const key = `${userId}:${orgId}:${roleName}`;
  if (!userId || !orgId || mirroredUsers.has(key)) return;

  const appId = await getQuikLmsAppId();
  if (!appId) return;

  // The CATALOGUE name, as everywhere else — the top tier is `admin`, not `ADMIN`.
  await mirrorAppRoleToCentral(db, {
    orgId,
    userId,
    appId,
    roleName: lmsRoleToAppRoleName(roleName),
  });
  mirroredUsers.add(key);
}

/**
 * Assign `roleName` to `userId` in this org, replacing any existing LMS app
 * role (one role per user per org — matches assignAppRoles' delete-then-insert
 * convention). No-op when the role isn't seeded for the org.
 */
export async function ensureUserOnLmsRole(
  userId: string,
  orgId: string,
  roleName: LmsUserRole,
): Promise<boolean> {
  const roles = await seedLmsAppRoles(orgId);
  const appRoleName = lmsRoleToAppRoleName(roleName);
  const roleId = roles.get(appRoleName);
  if (!roleId) return false;

  // NO LMS-ROW PRECONDITION ANY MORE. `app_quiklms.UserAppRole.userId` used to be a
  // foreign key to `app_quiklms.users(id)`, so an assignment could not precede the
  // LMS person — and this function bailed out when the row was missing rather than
  // raising `UserAppRole_userId_fkey` and 500-ing the caller.
  //
  // That guard is what left an org's FIRST admin with no role. The launcher's
  // `POST /api/internal/provision-roles` passes CENTRAL user ids for admins who have
  // never been provisioned into the LMS, so the bail-out fired every time.
  //
  // Migration `20260811120000_quiklms_role_fk_to_auth_user` repointed both
  // assignment tables at `auth.User`, which is what every other app that enforces
  // this FK already does. A role is a statement about a LOGIN, so a central user is
  // now the only precondition — and the FK itself enforces that, which is why there
  // is no lookup here to duplicate it.
  //
  // The boolean return stays: the caller counted a silent no-op as a successful
  // assignment and reported `assigned: 1` for a user it had not assigned, which is
  // why this went unnoticed for as long as it did.

  const existing = await db.lmsUserAppRole.findFirst({
    where: { userId, orgId },
    select: { roleId: true },
  });
  if (existing?.roleId !== roleId) {
    await db.lmsUserAppRole.deleteMany({ where: { userId, orgId } });
    await db.lmsUserAppRole.create({ data: { userId, orgId, roleId } });
  }

  // Mirror the assigned role NAME onto central quikit.UserAppAccess.role so the
  // Admin Portal's "Roles per Application" column reflects LMS-side assignments
  // (roster, bulk upload, provisioning). Parity with quikscale/quikinfra, which
  // call mirrorAppRoleToCentral on every role change. The source of truth stays
  // app_quiklms.UserAppRole; this only keeps the denormalised central copy in
  // lock-step. Runs even when the LMS role was already correct, in case central
  // drifted. No-op if the user has no UserAppAccess row for the app.
  //
  // Mirrors `appRoleName`, not `roleName` — the central column holds the CATALOGUE
  // name, so the top tier must land there as `admin` (what the portal renders, and
  // what migration 20260729120000 backfilled), never the enum's `ADMIN`.
  const appId = await getQuikLmsAppId();
  if (appId) {
    await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName: appRoleName });
  }

  return true;
}
