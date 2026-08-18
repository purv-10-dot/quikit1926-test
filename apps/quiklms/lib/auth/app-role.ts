/**
 * Assigned per-app role resolver — the consumption side of the platform RBAC
 * flow, mirroring how quikscale / quiktrack / quikcrm authorise off
 * `app_<slug>.UserAppRole → AppRole` rather than the central
 * `UserAppAccess.role` mirror.
 *
 * When a platform/org admin assigns a QuikLMS role to a user (Admin Portal
 * → Edit Member → Roles per Application, or the invite/provision flow), the
 * central `assignAppRoles()` writes an `app_quiklms."UserAppRole"` row pointing
 * at the seeded `LmsAppRole` whose NAME is `admin` or one of the `LmsUserRole`
 * values (see lib/api/seed-lms-app-roles.ts). This reads that assignment back and
 * maps the role name straight to the enum.
 *
 * Returns null when the user has no (non-expired) assignment — callers then
 * fall back to the LMS `User.role` row and finally the coarse membership-role
 * mapping, so users provisioned before/without an explicit assignment resolve
 * exactly as they do today (no behavioural change for them).
 */
import type { LmsUserRole } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Map an `app_quiklms.AppRole` NAME to the effective `LmsUserRole`. The six
 * UPPERCASE tiers map to themselves; the platform-standard `admin` system role
 * (the only `isSystem` row — see lib/api/seed-lms-app-roles.ts) is the TOP tier
 * and resolves to `ADMIN`. Any unknown name → null, so callers fall back to
 * User.role / the coarse membership mapping.
 *
 * `admin` used to resolve to `TENANT_ADMIN`, back when a separate `SUPER_ADMIN`
 * role held the top tier. That was three names for two tiers — `admin` and
 * `TENANT_ADMIN` were exact duplicates. `SUPER_ADMIN` is gone (it also collided
 * with the unrelated `isSuperAdmin` platform claim), and `admin` now names the
 * tier it always looked like it named. There is deliberately no `SUPER_ADMIN`
 * key here: a stale assignment row would fall through to null rather than
 * silently resolve, which is the safe direction.
 */
const ROLE_NAME_TO_ENUM: Record<string, LmsUserRole> = {
  TENANT_ADMIN: 'TENANT_ADMIN',
  SUB_ADMIN: 'SUB_ADMIN',
  MANAGER: 'MANAGER',
  TEACHER: 'TEACHER',
  PARENT: 'PARENT',
  LEARNER: 'LEARNER',
  admin: 'ADMIN',
};

/**
 * The role the platform assigned this user for QuikLMS in `orgId`, or null.
 * Honours `LmsUserAppRole.expiresAt` (a lapsed assignment is ignored).
 */
export async function getAssignedLmsRole(
  userId: string,
  orgId: string | null | undefined,
): Promise<LmsUserRole | null> {
  if (!userId || !orgId) return null;
  try {
    const assignment = await db.lmsUserAppRole.findFirst({
      where: {
        userId,
        orgId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      select: { role: { select: { name: true } } },
    });
    const name = assignment?.role?.name;
    return name ? (ROLE_NAME_TO_ENUM[name] ?? null) : null;
  } catch {
    // RBAC tables unavailable / not migrated — behave as "no assignment".
    return null;
  }
}
