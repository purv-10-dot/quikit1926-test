/**
 * The actor's authoritative membership facts, read from the central `OrgMember`
 * table rather than taken from the session claim: their org role, and whether they
 * are the org's FOUNDING admin.
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
 * "Founding admin" — the first admin-tier member of an org.
 *
 * WHY THIS EXISTS. QuikIT's `POST /api/super/orgs/[id]/members` can only invite
 * with membershipRole `"org_admin" | "member"` — there is no super-admin option
 * on that form. So the person a platform admin invites to run a brand-new org
 * arrives carrying `org_admin`, which `mapPlatformRoleToLmsRole` mapped to
 * `TENANT_ADMIN`, landing them on `/tenant-dashboard` (the CORPORATE tenant-admin
 * dashboard) with the "Admin" chip. The product intent is that the first
 * invitation into a new org confers the top admin tier, so this module supplies
 * the one fact the coarse membership role cannot carry: is this person the org's
 * founding administrator, or a later addition?
 *
 * WHAT "FIRST" MEANS. The earliest-created admin-tier `OrgMember` row in the org.
 * Deterministic (createdAt ASC, id ASC as the tie-break so a same-millisecond
 * batch insert cannot flip the answer between requests), needs no new column, and
 * is derived from the central identity tables — so it agrees whether it is read
 * during provisioning or on the invitee's first login.
 *
 * WHAT THIS DOES *NOT* GRANT. Being the founding admin resolves the LMS role to
 * `SUPER_ADMIN`, which drives the dashboard, the nav and the page guards. It does
 * NOT grant cross-tenant data access: every scoping decision in this app keys on
 * the platform operator claim `isSuperAdmin` (see `tenantWhere` /
 * `assertTenantMatch` in lib/auth/context.ts), which only apps/quikit's audited
 * super-admin console can set. A founding admin is the top admin OF THEIR ORG.
 */
import { db } from '@/lib/db';

/**
 * Central membership roles that count as admin-tier. Superset of
 * `ADMIN_TIER_ROLES` in `@quikit/shared` (`super_admin`, `org_admin`, legacy
 * `admin`) plus the two aliases `mapPlatformRoleToLmsRole` already treats as
 * org-admin equivalents, so the two modules cannot disagree about who is an admin.
 */
const ADMIN_TIER_MEMBERSHIP_ROLES = [
  'super_admin',
  'org_admin',
  'admin',
  'owner',
  'administrator',
] as const;

/**
 * Per-process cache. The answer changes at most once in an org's lifetime (when
 * its first admin is created), so a short TTL is ample and keeps this off the
 * request hot path. Negative answers are cached too — an org whose admin has not
 * been created yet is the normal state during provisioning, and re-querying it on
 * every request of a learner-only org would be pure overhead.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { userId: string | null; expiresAt: number }>();

/** Test seam — provisioning tests assert on a fresh read, not a warm cache. */
export function _clearFoundingAdminCache(): void {
  cache.clear();
}

/**
 * The `User.id` of the org's founding administrator, or null when the org has no
 * admin-tier member yet (or the lookup failed — see below).
 *
 * Errors resolve to null rather than throwing. A transient failure here must not
 * take down `getAuthContext`, and null is the safe direction: it degrades the
 * caller to `TENANT_ADMIN`, which is the behaviour that predates this module.
 * Failing the other way would mint a top-tier admin off a failed read.
 */
export async function getFoundingAdminUserId(
  orgId: string | null | undefined,
): Promise<string | null> {
  if (!orgId) return null;

  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.userId;

  let userId: string | null = null;
  try {
    const founder = await db.orgMember.findFirst({
      where: { orgId, role: { in: [...ADMIN_TIER_MEMBERSHIP_ROLES] } },
      // `createdAt` alone is not a total order — orgs provisioned in one
      // transaction can share a timestamp. `id` breaks the tie so every caller
      // (and every request) picks the SAME founder.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
    });
    userId = founder?.userId ?? null;
  } catch {
    return null; // Not cached — a transient fault should not stick for 60s.
  }

  cache.set(orgId, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
  return userId;
}

/** True when `userId` is the founding administrator of `orgId`. */
export async function isFoundingOrgAdmin(
  userId: string | null | undefined,
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!userId || !orgId) return false;
  return (await getFoundingAdminUserId(orgId)) === userId;
}

export interface CentralMembership {
  /**
   * `OrgMember.role` straight from the central table, or null when there is no row
   * (or the read failed). Null means "use the session claim instead" — never
   * "no role", so a transient fault cannot demote anybody.
   */
  role: string | null;
  /** Whether this user is the org's founding administrator. */
  isFounding: boolean;
}

/** Per-process cache for the actor's own membership row, same TTL as above. */
const roleCache = new Map<string, { role: string | null; expiresAt: number }>();

/** Test seam — see `_clearFoundingAdminCache`. */
export function _clearCentralMembershipCache(): void {
  roleCache.clear();
  cache.clear();
}

/**
 * Both facts the coarse role fallback needs, resolved from the central tables.
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
  if (!userId || !orgId) return { role: null, isFounding: false };

  const key = `${orgId}:${userId}`;
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { role: cached.role, isFounding: await isFoundingOrgAdmin(userId, orgId) };
  }

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
    return { role: null, isFounding: await isFoundingOrgAdmin(userId, orgId) };
  }

  return { role, isFounding: await isFoundingOrgAdmin(userId, orgId) };
}
