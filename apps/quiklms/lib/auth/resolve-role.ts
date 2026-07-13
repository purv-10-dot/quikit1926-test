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
import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

export interface SessionRoleInput {
  id: string;
  membershipRole?: string;
  isSuperAdmin?: boolean;
}

export async function resolveLmsRole(user: SessionRoleInput): Promise<UserRole> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (row) return row.role;
  } catch {
    /* LMS DB unavailable — fall through to the coarse membership mapping. */
  }
  return mapPlatformRoleToLmsRole(user.membershipRole, user.isSuperAdmin);
}
