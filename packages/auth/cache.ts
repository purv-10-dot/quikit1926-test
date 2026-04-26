/**
 * Hot-read cache used by the auth chain (`getTenantId`, `getDisabledModules`,
 * `isTenantAppBlocked`).
 *
 * Layered:
 *   1. **In-memory LRU** — first stop. Per-process, instant. Always on.
 *   2. **Upstash Redis (REST)** — second stop. Shared across serverless
 *      instances. Active only when both UPSTASH_REDIS_REST_URL and
 *      UPSTASH_REDIS_REST_TOKEN env vars are present.
 *
 * Cache strategy: short TTLs (15–60s) for everything membership/permission
 * shaped. The cost of a stale cache hit is "user has access for up to 60s
 * after admin revoked it" — acceptable for our threat model. The cost of
 * NOT caching is 4 DB hits per API call multiplied across every request.
 *
 * Note: `getOrSet` always falls open on cache failure (returns the loader's
 * fresh value) — a broken cache must not break auth.
 */

interface CacheEntry<T> { value: T; expiresAt: number; }

const MAX_LOCAL_ENTRIES = 1000;
const localStore = new Map<string, CacheEntry<unknown>>();

function lruEvict() {
  if (localStore.size <= MAX_LOCAL_ENTRIES) return;
  // Drop the oldest entry (Map preserves insertion order).
  const firstKey = localStore.keys().next().value;
  if (firstKey !== undefined) localStore.delete(firstKey);
}

function localGet<T>(key: string): T | undefined {
  const e = localStore.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    localStore.delete(key);
    return undefined;
  }
  // Refresh insertion order so this key is considered "most recently used".
  localStore.delete(key);
  localStore.set(key, e);
  return e.value;
}

function localSet<T>(key: string, value: T, ttlSeconds: number) {
  localStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  lruEvict();
}

function localDelete(key: string) { localStore.delete(key); }

/* ─── Upstash REST adapter ──────────────────────────────────────────────────── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashGet<T>(key: string): Promise<T | undefined> {
  if (!UPSTASH_ENABLED) return undefined;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const body = await res.json() as { result: string | null };
    if (body.result == null) return undefined;
    return JSON.parse(body.result) as T;
  } catch {
    return undefined;
  }
}

async function upstashSet<T>(key: string, value: T, ttlSeconds: number) {
  if (!UPSTASH_ENABLED) return;
  try {
    await fetch(
      `${UPSTASH_URL}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify(value)),
      },
    );
  } catch {
    // Best-effort: cache writes never block.
  }
}

async function upstashDelete(key: string) {
  if (!UPSTASH_ENABLED) return;
  try {
    await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch { /* swallow */ }
}

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * Get-or-load with a layered cache. The loader runs on cache miss only —
 * its return value is written to both layers so the next call is hot.
 *
 * @param key  unique cache key (callers should prefix by domain to avoid clashes)
 * @param ttl  TTL in seconds; the in-memory store and Upstash both honour it
 * @param loader function that produces the value when caches miss
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  // Layer 1: in-memory.
  const local = localGet<T>(key);
  if (local !== undefined) return local;

  // Layer 2: Upstash.
  const remote = await upstashGet<T>(key);
  if (remote !== undefined) {
    // Backfill the local layer so subsequent calls in this process skip the network.
    localSet(key, remote, ttlSeconds);
    return remote;
  }

  // Cache miss — load fresh.
  const fresh = await loader();
  localSet(key, fresh, ttlSeconds);
  // Fire-and-forget the upstream write; we already have the value.
  void upstashSet(key, fresh, ttlSeconds);
  return fresh;
}

/** Manual invalidation — use after a mutation that changes cached state. */
export async function invalidate(key: string): Promise<void> {
  localDelete(key);
  await upstashDelete(key);
}

/** Test / dev helper — wipe the in-memory layer. */
export function _clearLocalCache() { localStore.clear(); }

export const isUpstashEnabled = () => UPSTASH_ENABLED;
