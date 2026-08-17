import { getAppAccess } from "@quikit/auth/app-access";
import { getOrSet } from "@quikit/auth/cache";
import { HttpError } from "@/lib/errors";

export const QUIKCHAT_APP_SLUG = "quikchat";

/**
 * TTL for a cached access verdict, in seconds.
 *
 * ── HOW FAST IS REVOCATION? ────────────────────────────────────────────────
 * Revocation lands on TWO clocks, and only one of them is this cache:
 *
 *   • API surface (this module)  — up to 30s stale. An admin who revokes
 *     access at t=0 can still see that user's API calls succeed until t+30s.
 *   • The user's OWN client      — immediate-ish. `GET /api/session/validate`
 *     is UNCACHED and re-reads OrgAppAccess/UserAppAccess directly on every
 *     poll; it returns `app_access_revoked`, and `SessionGuard` bounces them.
 *     That endpoint is deliberately NOT gated by this check (gating it would
 *     make a revoked user unable to learn they were revoked).
 *
 * So the visible effect on the person is fast; the residual window is a
 * 30-second tail on direct API calls by a client that ignores the probe. That
 * is the same trade `@quikit/auth/cache` documents for everything
 * membership-shaped ("stale hit = access for up to 60s after revoke"), and the
 * same TTL `feature-gate.ts` uses for per-tenant module flags.
 *
 * The window cuts both ways: a user just GRANTED access may also wait up to
 * 30s. `invalidate("quikchatAppAccess:{orgId}:{userId}")` from
 * `@quikit/auth/cache` clears both layers cluster-wide if that ever matters.
 *
 * Raising this trades revocation latency for DB load; lowering it does the
 * reverse. Do not set it to 0 — `getAppAccess` is 4 queries and this runs on
 * every authenticated API request.
 */
const ACCESS_TTL_SECONDS = 30;

const cacheKey = (orgId: string, userId: string) => `quikchatAppAccess:${orgId}:${userId}`;

/**
 * May this user open QuikChat? Cached wrapper over `getAppAccess` — the SINGLE
 * source of truth for the rule (`@quikit/auth/app-access`), which the
 * `(dashboard)` layout and `/api-docs/spec` also call.
 *
 * Deliberately delegates rather than reimplementing a narrower check. A local
 * "does this user have a UserAppAccess row" would be cheaper and WRONG: rule 3
 * of `getAppAccess` grants org admins and super admins access on org-level
 * entitlement ALONE, with no per-user row. Hand-rolling it would lock out every
 * org admin who was never explicitly granted the app.
 *
 * `memberRole` must be the caller's real membership role. `withOrgAuth` reads it
 * from the JWT (`AuthContext.orgRole`), matching what the layout passes from the
 * session — passing `undefined` would silently deny org admins for the reason
 * above.
 *
 * Costs 4 Prisma queries on a cache miss, zero on a hit (in-memory LRU first,
 * then shared Redis). See ACCESS_TTL_SECONDS for the staleness contract.
 */
export async function hasQuikChatAccess(params: {
  userId: string;
  orgId: string;
  isSuperAdmin: boolean;
  memberRole?: string | null;
}): Promise<boolean> {
  const { userId, orgId, isSuperAdmin, memberRole } = params;
  return getOrSet(cacheKey(orgId, userId), ACCESS_TTL_SECONDS, async () => {
    const { hasAccess } = await getAppAccess({
      userId,
      orgId,
      appSlug: QUIKCHAT_APP_SLUG,
      isSuperAdmin,
      memberRole,
    });
    return hasAccess;
  });
}

/**
 * Throw a 403 unless the caller may open QuikChat.
 *
 * WHY THIS EXISTS ON THE API SURFACE: `withAuth` verifies the JWT and an
 * `orgId` and nothing else, and `middleware.ts`'s matcher excludes `/api/*`
 * entirely. The app-access gate lived ONLY in `(dashboard)/layout.tsx`, which
 * route handlers never run — so any authenticated same-org user with no
 * QuikChat grant could drive every QuikChat API directly (read channels, post
 * messages, accept invites) while the UI politely refused to load for them.
 * The UI refusing is exactly what made the gap look closed.
 *
 * 403 rather than 404: the caller is authenticated and identified, so 404
 * conceals nothing — the dashboard already tells them the app exists by
 * redirecting to `/?reason=no_app_access`. Mirrors `/api-docs/spec`.
 */
export async function assertQuikChatAccess(params: {
  userId: string;
  orgId: string;
  isSuperAdmin: boolean;
  memberRole?: string | null;
}): Promise<void> {
  if (await hasQuikChatAccess(params)) return;
  throw new HttpError(403, "QuikChat access required");
}
