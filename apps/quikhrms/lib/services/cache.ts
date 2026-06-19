import { getOrSet, invalidate } from "@quikit/auth/cache";

/**
 * Hot-path cache facade — delegates to the shared layered cache
 * (`@quikit/auth/cache`): in-memory LRU → shared Redis (`@quikit/redis`)
 * → loader. Matches the platform cache-management doc:
 *  - Redis optional: REDIS_URL unset degrades to per-process LRU.
 *  - Fail-open: cache errors return the loader's fresh value.
 *  - `invalidateKeys` drops the local copy, deletes the Redis key, and
 *    publishes on `quikit:cache-invalidate` so peer pods evict too.
 *
 * NOT cached (resolved live per request): permissions, the current-user
 * profile, and the unread-notification count. No other QuikIT app
 * (QuikScale/QuikTrack/QuikInfra) caches these in Redis — they query the DB
 * per request — so HRMS matches that. Session validity and central membership
 * are likewise no longer cached here: HRMS trusts the central JWT per request
 * (see lib/with-auth.ts), exactly like the other apps. Leave policies are now
 * read straight from Postgres too — so nothing currently rides this facade's
 * cached path; every `getCached` caller uses an UNCACHED_PREFIXES key and runs
 * its loader live. The facade is kept as a thin pass-through (and to preserve
 * the prefix policy) should any cached read be reintroduced later.
 */
const UNCACHED_PREFIXES = ["perms:", "employee-me:", "notif-unread:"];
const isUncached = (key: string): boolean => UNCACHED_PREFIXES.some((p) => key.startsWith(p));

export async function getCached<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
  // Live read — no Redis/LRU — for the HRMS-only hot-path keys above.
  if (isUncached(key)) return loader();
  return getOrSet(key, ttlSec, loader);
}

/** Delete one or more exact keys. Use on write paths to bust cache. */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  // Uncached keys have nothing to bust — skip them (no Redis touch).
  await Promise.all(keys.filter((k) => !isUncached(k)).map((k) => invalidate(k)));
}

/**
 * Key builders — keep naming consistent across read + invalidate sites.
 *
 * Scope is intentionally narrow: only the few caches that ride the hot path.
 * Permissions + per-user profile/notification count are the cached reads;
 * everything else (config, lists, lookups) reads from Postgres directly. The
 * `session-valid:{authUserId}` and `analytics:*` keys are built inline at their
 * call sites, not here.
 *
 * No wildcard delete exists in the shared cache — invalidation is exact-key
 * only, so every cached read must have a derivable invalidation key.
 */
export const cacheKeys = {
  employeeMe: (orgId: string, userId: string) => `employee-me:${orgId}:${userId}`,
  permissions: (orgId: string, userId: string) => `perms:${orgId}:${userId}`,
  notifUnread: (orgId: string, userId: string) => `notif-unread:${orgId}:${userId}`,
};
