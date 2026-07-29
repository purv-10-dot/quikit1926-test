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
 * QuikLMS's "app roles" ARE its seven `LmsUserRole` enum values — the role
 * names deliberately equal the enum so consumption maps name → enum directly.
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
 * Roles"; every app-specific tier is a Custom Role. In QuikLMS `admin` grants
 * organization-administrator access — it resolves to `TENANT_ADMIN` at runtime
 * (see lib/auth/app-role.ts), mirroring quikscale where `admin` is the
 * full-access role.
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
 *   - exactly ONE `isSystem: true` role — `admin` — shown under "System Roles";
 *   - every LMS tier is a Custom Role (`isSystem: false`), names === the
 *     `LmsUserRole` enum so consumption maps name → enum directly;
 *   - `LEARNER` is the least-privilege `isDefault` auto-assign role.
 * Ordered admin-first so it surfaces at the top (the Admin Portal also orders
 * `isSystem DESC`).
 */
export const LMS_APP_ROLES: readonly LmsRoleSpec[] = [
  { name: LMS_SYSTEM_ADMIN_ROLE, description: 'Full organization access — auto-seeded platform system role. Grants organization-administrator (TENANT_ADMIN) access in QuikLMS.', isSystem: true, isDefault: false },
  { name: 'SUPER_ADMIN', description: 'Platform operator — cross-tenant support access.', isSystem: false, isDefault: false },
  { name: 'TENANT_ADMIN', description: 'Organization administrator — full access within the organization.', isSystem: false, isDefault: false },
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
 * Assign `roleName` to `userId` in this org, replacing any existing LMS app
 * role (one role per user per org — matches assignAppRoles' delete-then-insert
 * convention). No-op when the role isn't seeded for the org.
 */
export async function ensureUserOnLmsRole(
  userId: string,
  orgId: string,
  roleName: LmsUserRole,
): Promise<void> {
  const roles = await seedLmsAppRoles(orgId);
  const roleId = roles.get(roleName);
  if (!roleId) return;

  // The LMS row must exist FIRST. `app_quiklms.UserAppRole.userId` is a foreign key
  // to `app_quiklms.users(id)` — an assignment cannot precede the person.
  //
  // Callers that create the row themselves (provisionLmsUser) are fine, but the
  // launcher's `POST /api/internal/provision-roles` passes CENTRAL user ids for
  // admins who may never have been provisioned into the LMS, and every one of those
  // raised `Foreign key constraint violated: UserAppRole_userId_fkey` and 500'd the
  // endpoint. Returning quietly matches the two no-ops above: the assignment is
  // re-derivable, and `provisionLmsUser` writes it the moment the person is created.
  const lmsUser = await db.lmsUser.findUnique({ where: { id: userId }, select: { id: true } });
  if (!lmsUser) return;

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
  const appId = await getQuikLmsAppId();
  if (appId) {
    await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName });
  }
}
