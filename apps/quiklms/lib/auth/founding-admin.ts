/**
 * The actor's authoritative membership ROLE, read from the central `OrgMember`
 * table rather than taken from the session claim.
 *
 * WHY WE DO NOT TRUST `session.user.membershipRole`. On the SSO/OIDC path that claim
 * is manufactured by QuikIT's token endpoint as:
 *
 *     const membership = await db.orgMember.findFirst({
 *       where: { userId, orgId, status: "active" }, select: { role: true } });
 *     …
 *     role: membership?.role ?? "member",      // apps/quikit/app/api/oauth/token/route.ts
 *
 * Two things follow, and together they are the "SSO logs me in as a learner" bug:
 *
 *   1. The `status: "active"` filter plus the `?? "member"` fallback mean a
 *      freshly-invited admin whose OrgMember row has not flipped to `active` by the
 *      time the code is exchanged gets the literal string `"member"` — which
 *      `mapPlatformRoleToLmsRole` maps to LEARNER, landing them on
 *      `/learner/dashboard` while the central row plainly says `org_admin`.
 *   2. The claim is copied onto this app's JWT ONLY on initial sign-in
 *      (`if (user)` in createOAuthClientOptions' jwt callback) and the session lasts
 *      7 days. So a session minted during that window keeps resolving LEARNER on
 *      every later request. Nothing re-reads it and nothing self-heals; signing out
 *      and back in is the only cure.
 *
 * The launcher hand-off path does not have this problem — `POST /api/launch-token`
 * stamps `membershipRole` from a live DB read — which is exactly why the bug looked
 * SSO-specific.
 *
 * Both of those files live in `apps/quikit` / `packages/auth`, which QuikLMS may not
 * edit (CLAUDE.md Rule 2). Reading the authoritative row here is the fix that IS
 * available to us, and it is the better posture regardless: it cannot over-grant
 * (the central row is the source of truth the claim was trying to summarise), and it
 * self-heals a stale session on the next request.
 *
 * HISTORY: this module used to also compute "founding admin" status (was this
 * the earliest admin-tier `OrgMember` row in the org?), because `org_admin`
 * resolved to `TENANT_ADMIN` unless the caller was the org's first invitee.
 * That distinction was removed 2026-08-04 — every `org_admin` is `ADMIN` now
 * (see lib/auth/role-resolution.ts) — so this module is the live-role-read fix
 * only. The org-scoping that removal needed is `assertCanActOnGlobalCourse` in
 * lib/services/master-course-service.ts, unrelated to this file.
 */
import { db } from '@/lib/db';

export interface CentralMembership {
  /**
   * `OrgMember.role` straight from the central table, or null when there is no row
   * (or the read failed). Null means "use the session claim instead" — never
   * "no role", so a transient fault cannot demote anybody.
   */
  role: string | null;
}

/** Per-process cache for the actor's own membership row. */
const CACHE_TTL_MS = 60_000;
const roleCache = new Map<string, { role: string | null; expiresAt: number }>();

/** Test seam — provisioning/login tests assert on a fresh read, not a warm cache. */
export function _clearCentralMembershipCache(): void {
  roleCache.clear();
}

/**
 * The fact the coarse role fallback needs, resolved from the central table.
 *
 * Deliberately NOT filtered on `status`. An invited-but-not-yet-accepted admin is
 * still an admin, and gating this read on `active` is precisely the mistake that
 * produced `"member"` in the id_token. Whether the membership entitles them to open
 * QuikLMS at all is a separate question, already answered — and enforced — by
 * `hasCentralAppAccess` in `requireAuth` before this value is ever used.
 */
export async function resolveCentralMembership(
  userId: string | null | undefined,
  orgId: string | null | undefined,
): Promise<CentralMembership> {
  if (!userId || !orgId) return { role: null };

  const key = `${orgId}:${userId}`;
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { role: cached.role };

  let role: string | null = null;
  try {
    const member = await db.orgMember.findFirst({
      where: { orgId, userId },
      select: { role: true },
    });
    role = member?.role ?? null;
    roleCache.set(key, { role, expiresAt: Date.now() + CACHE_TTL_MS });
  } catch {
    // Not cached — fall through with null so the caller uses the session claim.
    return { role: null };
  }

  return { role };
}
