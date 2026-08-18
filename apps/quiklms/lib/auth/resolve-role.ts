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
 * Single-role model (quikscale parity) — there is no held/active distinction
 * to reconcile anymore.
 */
import type { LmsUserRole as UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { getAssignedLmsRole } from '@/lib/auth/app-role';
import { resolveCentralMembership } from '@/lib/auth/founding-admin';
import { healLmsRoleAssignment } from '@/lib/auth/heal-role-assignment';

export interface SessionRoleInput {
  id: string;
  /** Platform Org id — used to resolve the Tenant row on the coarse fallback. */
  orgId?: string | null;
  membershipRole?: string;
  isSuperAdmin?: boolean;
}

export async function resolveLmsRole(user: SessionRoleInput): Promise<UserRole> {
  let effective: UserRole | null = null;

  try {
    // Two independent reads, settled separately so a failure on one cannot drop
    // the other (same posture as `getAuthContext`).
    const [assignedRes, rowRes] = await Promise.allSettled([
      getAssignedLmsRole(user.id, user.orgId),
      db.lmsUser.findUnique({ where: { id: user.id }, select: { role: true } }),
    ]);

    // Platform-assigned app role wins (mirrors the other apps, which authorise
    // off app_<slug>.UserAppRole). Absent → the LMS User.role row, so users with
    // no explicit assignment resolve exactly as before.
    if (assignedRes.status === 'fulfilled' && assignedRes.value) effective = assignedRes.value;
    else if (rowRes.status === 'fulfilled' && rowRes.value) effective = rowRes.value.role;

    if (!effective) {
      // No assignment yet — the freshly-invited admin case. Read the
      // authoritative central membership ROLE, because the SSO path's
      // `membershipRole` claim degrades to "member" → LEARNER, and is never
      // re-read for the session's 7-day life. Mirrors getAuthContext's
      // fallback exactly; the two must not drift or the page guard and the
      // API guard disagree about who someone is.
      //
      // The tenant lookup rides along because `org_admin` is ambiguous — it is
      // what BOTH ADMIN and TENANT_ADMIN are stored as centrally, and only the
      // presence of an `LmsTenant` row separates them. `getAuthContext` gets this
      // for free (it already reads the tenant for `tenantType`); here it is an
      // extra PK hit, but only on this fallback, which runs solely for someone
      // with no assignment and no LMS row.
      const [membership, tenantRow] = await Promise.all([
        resolveCentralMembership(user.id, user.orgId),
        user.orgId
          ? db.lmsTenant.findUnique({ where: { id: user.orgId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      effective = mapPlatformRoleToLmsRole(
        membership.role ?? user.membershipRole,
        user.isSuperAdmin,
        // Truthiness, not `!== null`: a miss is `null` from Prisma but `undefined`
        // from anything that stubs this call, and `undefined !== null` would read
        // every org as a tenant.
        Boolean(tenantRow),
      );

      // Persist what we just derived so the NEXT request is answered by the
      // assignment row instead of re-deriving it. Fire-and-forget — see
      // heal-role-assignment.ts for why this only runs on the full fallback.
      healLmsRoleAssignment(user.id, user.orgId, effective, user.isSuperAdmin);
    }
  } catch {
    /* LMS DB unavailable — fall through to the coarse membership mapping. */
  }

  return effective ?? mapPlatformRoleToLmsRole(user.membershipRole, user.isSuperAdmin);
}
