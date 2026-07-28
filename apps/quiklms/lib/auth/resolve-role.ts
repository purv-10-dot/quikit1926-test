/**
 * Effective-LMS-role resolver — the SINGLE source of truth for "which role is
 * this user" outside of `getAuthContext`. Prefers the user's LMS `User.role`
 * row (the fine-grained TEACHER / PARENT / LEARNER / TENANT_ADMIN a roster
 * created) and falls back to the coarse platform membership-role mapping when
 * no LMS row exists yet (e.g. the operator seeded by apps/quikit super/orgs).
 *
 * This mirrors the role branch of `getAuthContext` so the post-login landing
 * redirect (`app/page.tsx`) sends people to the SAME role's dashboard that the
 * API guards (`requireRoles`, which read `getAuthContext`) will honour. Keeping
 * the two in lock-step is what prevents "lands on the wrong dashboard" drift.
 */
import type { LmsUserRole as UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { getAssignedLmsRole } from '@/lib/auth/app-role';

export interface SessionRoleInput {
  id: string;
  /** Platform Org id — used to resolve the Tenant row on the coarse fallback. */
  orgId?: string | null;
  membershipRole?: string;
  isSuperAdmin?: boolean;
}

export async function resolveLmsRole(user: SessionRoleInput): Promise<UserRole> {
  try {
    // Platform-assigned app role wins (mirrors the other apps, which authorise
    // off app_<slug>.UserAppRole). Absent → fall back to the LMS User.role row,
    // so users with no explicit assignment resolve exactly as before.
    const assigned = await getAssignedLmsRole(user.id, user.orgId);
    if (assigned) return assigned;

    const row = await db.lmsUser.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (row) return row.role;

    // No LMS row yet — disambiguate the operator (org has no `Tenant` row →
    // SUPER_ADMIN) from a tenant admin (org has one → TENANT_ADMIN) so a
    // freshly-onboarded school admin lands on their tenant dashboard, not the
    // super-admin portal. Mirrors getAuthContext's fallback exactly.
    let hasTenantRow = false;
    if (user.orgId) {
      const tenant = await db.lmsTenant.findUnique({
        where: { id: user.orgId },
        select: { id: true },
      });
      hasTenantRow = !!tenant;
    }
    return mapPlatformRoleToLmsRole(user.membershipRole, user.isSuperAdmin, hasTenantRow);
  } catch {
    /* LMS DB unavailable — fall through to the coarse membership mapping. */
  }
  return mapPlatformRoleToLmsRole(user.membershipRole, user.isSuperAdmin);
}
