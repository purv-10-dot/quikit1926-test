/**
 * Assigned per-app role resolver — the consumption side of the platform RBAC
 * flow, mirroring how quikscale / quiktrack / quikcrm authorise off
 * `app_<slug>.UserAppRole → AppRole` rather than the central
 * `UserAppAccess.role` mirror.
 *
 * When a super-admin/org-admin assigns a QuikLMS role to a user (Admin Portal
 * → Edit Member → Roles per Application, or the invite/provision flow), the
 * central `assignAppRoles()` writes an `app_quiklms."UserAppRole"` row pointing
 * at the seeded `LmsAppRole` whose NAME is one of the `LmsUserRole` values
 * (see lib/api/seed-lms-app-roles.ts). This reads that assignment back and maps
 * the role name straight to the enum.
 *
 * Returns null when the user has no (non-expired) assignment — callers then
 * fall back to the LMS `User.role` row and finally the coarse membership-role
 * mapping, so users provisioned before/without an explicit assignment resolve
 * exactly as they do today (no behavioural change for them).
 */
import type { LmsUserRole } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Map an `app_quiklms.AppRole` NAME to the effective `LmsUserRole`. The seven
 * enum tiers map to themselves; the platform-standard `admin` system role
 * (seeded for Admin-Portal parity — see lib/api/seed-lms-app-roles.ts) grants
 * organization-administrator access, i.e. resolves to `TENANT_ADMIN` (same as
 * quikscale, where `admin` is the full-access role). Any unknown name → null,
 * so callers fall back to User.role / the coarse membership mapping.
 */
const ROLE_NAME_TO_ENUM: Record<string, LmsUserRole> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  SUB_ADMIN: 'SUB_ADMIN',
  MANAGER: 'MANAGER',
  TEACHER: 'TEACHER',
  PARENT: 'PARENT',
  LEARNER: 'LEARNER',
  admin: 'TENANT_ADMIN',
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
