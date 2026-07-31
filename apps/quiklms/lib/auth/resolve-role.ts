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
 * the two in lock-step is what prevents "lands on the wrong dashboard" drift —
 * including the ACTIVE role of a multi-role user (see lib/auth/active-role.ts),
 * which is why `resolveLmsRole` returns the active role and not the effective
 * one. A user who switched to Sub Admin must be let into `(sub-admin)` by the
 * page guard and be granted the same role by the API guard.
 */
import type { LmsUserRole as UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { getAssignedLmsRole } from '@/lib/auth/app-role';
import { resolveCentralMembership } from '@/lib/auth/founding-admin';
import { heldRoles, readRequestedRole, resolveActiveRole } from '@/lib/auth/active-role';

export interface SessionRoleInput {
  id: string;
  /** Platform Org id — used to resolve the Tenant row on the coarse fallback. */
  orgId?: string | null;
  membershipRole?: string;
  isSuperAdmin?: boolean;
}

export interface ResolvedRoles {
  /** The role the database alone says they are — no cookie involved. */
  effective: UserRole;
  /** Every role they may act as, default (== `effective`) first. */
  held: UserRole[];
  /** The one they are acting as on THIS request. */
  active: UserRole;
}

/**
 * The full role picture for a session user. Callers that only need one value
 * should use `resolveLmsRole`; the page guard needs the held set too, so it can
 * say "you may switch to this" rather than just "this is what you are".
 */
export async function resolveLmsRoles(user: SessionRoleInput): Promise<ResolvedRoles> {
  let effective: UserRole | null = null;
  let secondary: UserRole | null = null;

  try {
    // Two independent reads, settled separately so a failure on one cannot drop
    // the other (same posture as `getAuthContext`). The LMS row has to be read
    // even when an assignment exists, because `secondaryRole` lives on the row:
    // a platform-assigned TEACHER who was ALSO promoted to sub-admin holds both,
    // and returning early on the assignment is what hid the second role.
    const [assignedRes, rowRes] = await Promise.allSettled([
      getAssignedLmsRole(user.id, user.orgId),
      db.lmsUser.findUnique({
        where: { id: user.id },
        select: { role: true, secondaryRole: true },
      }),
    ]);

    const row = rowRes.status === 'fulfilled' ? rowRes.value : null;
    secondary = row?.secondaryRole ?? null;

    // Platform-assigned app role wins (mirrors the other apps, which authorise
    // off app_<slug>.UserAppRole). Absent → the LMS User.role row, so users with
    // no explicit assignment resolve exactly as before.
    if (assignedRes.status === 'fulfilled' && assignedRes.value) effective = assignedRes.value;
    else if (row) effective = row.role;

    if (!effective) {
      // No LMS row and no assignment yet — the freshly-invited admin case. Read the
      // authoritative central membership: its ROLE (because the SSO path's
      // `membershipRole` claim degrades to "member" → LEARNER, and is never re-read
      // for the session's 7-day life) and whether they are the org's FOUNDING admin
      // (which separates the person invited to run a NEW org — SUPER_ADMIN, landing
      // on `/dashboard` — from an admin added to an established one). Mirrors
      // getAuthContext's fallback exactly; the two must not drift or the page guard
      // and the API guard disagree about who someone is.
      const membership = await resolveCentralMembership(user.id, user.orgId);
      effective = mapPlatformRoleToLmsRole(
        membership.role ?? user.membershipRole,
        user.isSuperAdmin,
        membership.isFounding,
      );
    }
  } catch {
    /* LMS DB unavailable — fall through to the coarse membership mapping. */
  }

  effective ??= mapPlatformRoleToLmsRole(user.membershipRole, user.isSuperAdmin);

  const held = heldRoles(effective, secondary);
  return { effective, held, active: resolveActiveRole(held, readRequestedRole()) };
}

export async function resolveLmsRole(user: SessionRoleInput): Promise<UserRole> {
  return (await resolveLmsRoles(user)).active;
}
