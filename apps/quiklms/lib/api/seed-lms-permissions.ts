/**
 * Seed `app_quiklms.RolePermission` from the derived matrix — the LMS counterpart
 * of quikscale's `backfillAdminPermissions` / `backfillMemberPermissions`.
 *
 * The grants come from `lib/auth/permission-matrix.generated.ts`, which is read out
 * of the live `requireRoles(...)` declarations by
 * `scripts/derive-permission-matrix.mjs`. That is the whole point: seeding makes
 * RBAC v2 reproduce today's authorisation rather than a policy someone invented.
 * QuikLMS had 0 rows in this table against quikscale's 1,922.
 *
 * Role names in the matrix are the seven `LmsUserRole` values, and
 * `seedLmsAppRoles` already creates one `AppRole` per org under exactly those
 * names, so a grant maps to a role row by name with no translation table.
 *
 * Idempotent: `createMany` + `skipDuplicates` against
 * `@@unique([roleId, resource, action])`. Safe to re-run after regenerating the
 * matrix or adding a role.
 */
import { db } from '@/lib/db';
import { seedLmsAppRoles } from '@/lib/api/seed-lms-app-roles';
import { PERMISSION_MATRIX } from '@/lib/auth/permission-matrix.generated';
import { isAction } from '@/lib/auth/permissions-registry';

export interface SeedPermissionsResult {
  /** Grants inserted on this run (0 on a re-run — they already exist). */
  created: number;
  /** Grants the matrix asked for, whether or not they were new. */
  intended: number;
  /**
   * Kept at zero now that ungated handlers are granted to every role by the
   * generator rather than held back. A non-empty list would mean the matrix still
   * carries a sentinel this seeder does not understand.
   */
  skippedUngated: string[];
  /** Role names in the matrix with no matching AppRole row in this org. */
  unknownRoles: string[];
}

/**
 * Write every grant the matrix declares for `orgId`.
 *
 * Nothing reads these rows yet — `requireRoles` still decides every request. This
 * populates the model so the shadow probe in `requireAuth` can report where the
 * two would disagree.
 */
/**
 * Orgs whose grants this process has already seeded.
 *
 * Mirrors the `seededOrgs` cache in `seed-lms-app-roles.ts`, and matters more here:
 * the matrix is 392 pairs, so a re-seed is three chunked `createMany` calls. On the
 * lazy path (`GET /api/me`, which runs on nearly every page load) that has to be a
 * no-op after the first hit.
 */
const seededOrgs = new Set<string>();

/**
 * Ensure an org has BOTH the role catalogue and the grants behind it.
 *
 * WHY THIS EXISTS. Authorisation now fails closed, so an org with `AppRole` rows and
 * no `RolePermission` rows is an org where every request is refused — its tenant
 * admin included. `seedLmsAppRoles` creates the catalogue and was already called
 * from three places (tenant onboarding, the launcher's provision-roles endpoint, and
 * the lazy top-up in `/api/me`); none of them seeded grants, because until now
 * nothing read them. A tenant onboarded after the cutover would have been locked out
 * of its own LMS on first login.
 *
 * Call this instead of `seedLmsAppRoles` from any provisioning path.
 */
export async function ensureLmsRbacSeeded(orgId: string): Promise<void> {
  if (!orgId || seededOrgs.has(orgId)) return;
  await seedLmsPermissions(orgId);
  seededOrgs.add(orgId);
}

export async function seedLmsPermissions(orgId: string): Promise<SeedPermissionsResult> {
  const result: SeedPermissionsResult = { created: 0, intended: 0, skippedUngated: [], unknownRoles: [] };
  if (!orgId) return result;

  // The role catalogue has to exist before grants can hang off it.
  const roleIdByName = await seedLmsAppRoles(orgId);
  if (roleIdByName.size === 0) return result;

  const rows: Array<{ roleId: string; resource: string; action: string }> = [];
  const unknown = new Set<string>();

  for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
    for (const [action, roles] of Object.entries(actions)) {
      if (!isAction(action) || !roles) continue;

      for (const roleName of roles) {
        const roleId = roleIdByName.get(roleName);
        if (!roleId) {
          unknown.add(roleName);
          continue;
        }
        rows.push({ roleId, resource, action });
        result.intended += 1;
      }
    }
  }

  result.unknownRoles = [...unknown].sort();
  result.skippedUngated.sort();

  if (rows.length === 0) return result;

  // Chunked: a single createMany of several thousand rows is one very large
  // statement, and this runs against the shared platform database.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { count } = await db.lmsRolePermission.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    result.created += count;
  }

  return result;
}
