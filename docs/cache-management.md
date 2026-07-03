# Cache Management — Technical Documentation

> **Status:** Reference document. Describes how caching works across the QuikIT
> monorepo as currently implemented.
>
> **Audience:** Engineers working on auth, performance, feature flags, rate
> limiting, or anything that reads/writes the cache layers.
>
> **Scope:** Reflects the **current implementation only**. Covers the shared
> Redis client, the layered auth cache, feature-gate / tenant-resolution
> caching, session caching, rate limiting, short-lived OTP/OAuth stores,
> Next.js data cache / ISR, and TanStack React Query.

---

## Table of contents

1. [Overview & end-to-end model](#1-overview--end-to-end-model)
2. [Architecture diagram](#2-architecture-diagram)
3. [Initialization & configuration](#3-initialization--configuration)
4. [How each app uses the cache](#4-how-each-app-uses-the-cache)
5. [Cache key structure & naming conventions](#5-cache-key-structure--naming-conventions)
6. [Cache read/write flow](#6-cache-readwrite-flow)
7. [Invalidation & refresh mechanisms](#7-invalidation--refresh-mechanisms)
8. [Redis integration & usage](#8-redis-integration--usage)
9. [Session caching flow](#9-session-caching-flow)
10. [API caching flow](#10-api-caching-flow)
11. [Middleware & utility functions](#11-middleware--utility-functions)
12. [Environment variables](#12-environment-variables)
13. [Folder structure & file responsibilities](#13-folder-structure--file-responsibilities)
14. [Data-flow diagrams](#14-data-flow-diagrams)
15. [Debugging & troubleshooting](#15-debugging--troubleshooting)
16. [Best practices, failure impact & fallback](#16-best-practices-failure-impact--fallback)

---

## 1. Overview & end-to-end model

The platform caches aggressively to keep the **per-request auth/permission
overhead near zero**. Without it, every authenticated API call would issue
several DB lookups (membership, app access, disabled-module set, tenant-app
block). Caching collapses these to roughly nothing on the hot path.

There are **four conceptual layers**, applied in order on a hot read:

```
1. React.cache()      per-request memoization (one render/handler pass)   ── server only
2. In-memory LRU      per-process, instant, 1000-entry cap                ── @quikit/auth/cache
3. Shared Redis        cross-instance, optional (REDIS_URL)                ── @quikit/redis
4. Loader (DB)        source of truth on full miss                         ── @quikit/database
```

Two guiding principles run through the whole design:

- **Optional Redis / graceful degradation.** Every consumer calls `getRedis()`
  and falls back to in-memory when it returns `null`. The app runs identically
  in dev (no Redis) and prod (with Redis) — the only difference is durability
  and multi-instance coordination. ([packages/redis/index.ts:9-12](../packages/redis/index.ts#L9-L12))
- **Fail-open by default.** A broken cache must never break auth. `getOrSet`
  returns the loader's fresh value on any cache error; the feature gates and
  session check fail *open* (grant access) rather than locking users out on a
  transient glitch. Exceptions are explicitly marked `failClosed` (auth-critical
  rate limits).

Short TTLs (15–60s for auth/permission data) bound the staleness window: the
cost of a stale hit is "user keeps access for up to ~60s after an admin revoked
it" — accepted by the threat model; the cost of *not* caching is multiple DB
hits on every request. ([packages/auth/cache.ts:10-16](../packages/auth/cache.ts#L10-L16))

---

## 2. Architecture diagram

```
                         ┌─────────────────────────────────────────────┐
   authenticated request │  Server component / API route handler        │
                         └───────────────────────┬─────────────────────┘
                                                 │ getDisabledModules(orgId, app)
                                                 │ getOrgId(userId)  …
                                                 ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  React.cache()   ── dedupes repeats within ONE request │
                    │  (feature-gate.ts, get-tenant-id callers)             │
                    └───────────────────────┬──────────────────────────────┘
                                            │ miss (first call this request)
                                            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  getOrSet(key, ttl, loader)   ── @quikit/auth/cache    │
                    │                                                        │
                    │   1. localGet(key)   in-memory LRU (Map, max 1000)     │
                    │        └─ hit → return                                 │
                    │   2. redisGet(key)   @quikit/redis  (JSON parse)       │
                    │        └─ hit → backfill local → return                │
                    │   3. loader()        DB query / compute                │
                    │        └─ localSet + fire-and-forget redisSet → return │
                    └───────────────────────┬──────────────────────────────┘
                                            │
                                            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  @quikit/redis  (singleton ioredis, lazyConnect)       │
                    │   getRedis() → null when REDIS_URL unset → skip Redis   │
                    └────────────────────────────────────────────────────────┘

  INVALIDATION FAN-OUT (cross-process):
     invalidate(key)
        ├─ localStore.delete(key)                       (this process)
        ├─ cacheDel(key)                                 (Redis)
        └─ PUBLISH "quikit:cache-invalidate" key   ──►  every process's
                                                        subscriber deletes its
                                                        local copy (sub-second)
```

---

## 3. Initialization & configuration

The shared Redis client lives in
[`packages/redis/index.ts`](../packages/redis/index.ts). It is a
**singleton `ioredis` client** created lazily on first use:

```ts
// packages/redis/index.ts:59-93
export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) { logLoudlyInProd("missing-url"); return null; }

  if (!_client) {
    _client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) { return Math.min(times * 200, 3000); }, // backoff ≤ 3s
      lazyConnect: true,                                            // no connect at import
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
        return targetErrors.some((t) => err.message.includes(t));
      },
    });
    _client.on("error", (err) => { logLoudlyInProd("connection-error", err.message); /* … */ });
  }
  return _client;
}
```

Key configuration facts:

- **`lazyConnect: true`** — no socket is opened at import time; the first command
  triggers connection. Importing `@quikit/redis` is therefore free.
- **`maxRetriesPerRequest: 3`** + exponential backoff capped at **3s**.
- **`reconnectOnError`** auto-reconnects on `READONLY` / `ECONNRESET` /
  `ECONNREFUSED`.
- **Loud one-time, prod-only logging** (`logLoudlyInProd`,
  [index.ts:30-49](../packages/redis/index.ts#L30-L49)): the *first*
  missing-URL or connection error in production emits a `console.error` banner;
  subsequent errors are suppressed to avoid log spam. Dev/test stays quiet.

The layered cache lives in
[`packages/auth/cache.ts`](../packages/auth/cache.ts) and is initialized
lazily too — the cross-process invalidation subscriber is only spun up on the
first `getOrSet` call (`ensureInvalidationSubscriber`,
[cache.ts:39-65](../packages/auth/cache.ts#L39-L65)), so test
environments that never touch the cache don't open a Redis subscriber.

---

## 4. How each app uses the cache

Every app depends on `@quikit/redis` and `@quikit/auth` (transitively, via
middleware + auth guards), so all 9 participate in the same cache system.

| App | Primary cache usage |
|---|---|
| **auth** (3001) | Session store (`auth:session:*`), JWT soft-revocation, remote `/api/verify-token`, OTP & OAuth-prefill stores, rate-limited auth endpoints |
| **admin** (3002) | Typed JSON cache wrapper + `CacheKeys` (perms, feature flags, membership, dashboard stats) — [apps/admin/lib/redis.ts](../apps/admin/lib/redis.ts) |
| **quikit** (3000) | Feature-gate (`getDisabledModules`/`isTenantAppBlocked`), tenant resolution, module gating; super-admin feature-flag toggle calls `invalidateDisabledModules` |
| **quikscale** (3003) | Feature-gate module routing, tenant resolution, rate limiting, React Query CRUD caching ([lib/hooks/createCRUDHook.ts](../apps/quikscale/lib/hooks/createCRUDHook.ts)) |
| **quiktrack / quikinfra / quiksocial / Quikcrm / quikvc** | Same auth/feature-gate/tenant caching via shared packages; React Query on the client. quikinfra adds HTTP `Cache-Control` tiers + DB-backed idempotency |

All apps reach the cache through the **same shared packages** — there is no
per-app Redis client except admin's typed JSON wrapper, which itself delegates
to `@quikit/redis` and re-exports `getOrSet`/`invalidate` from
`@quikit/auth/cache` ([apps/admin/lib/redis.ts:11-17](../apps/admin/lib/redis.ts#L11-L17)).

---

## 5. Cache key structure & naming conventions

**Convention:** colon-delimited, domain-prefixed keys —
`<domain>:<entity>[:<scope>…]`. The prefix prevents collisions in the shared
keyspace; identifiers are `orgId` / `userId` / `appSlug`. Key strings are built
in one place per domain so the read path and the invalidation path can never
drift (e.g. `invalidateDisabledModules` derives the same string
`getDisabledModules` uses).

| Key pattern | Store | TTL | Purpose | Source |
|---|---|---|---|---|
| `auth:session:{sessionId}` | Redis | 30 days (set by caller) | JWT soft-revocation handle | [packages/auth/session-store.ts:4-8](../packages/auth/session-store.ts#L4-L8) |
| `disabledModules:{orgId}:{appSlug}` | LRU + Redis | **30s** | Set of disabled module keys (FF-1) | [feature-gate.ts:56](../packages/auth/feature-gate.ts#L56) |
| `tenantAppBlocked:{orgId}:{appSlug}` | LRU + Redis | **60s** | Hard app-access gate (SA-A.6) | [feature-gate.ts:191](../packages/auth/feature-gate.ts#L191) |
| `membership:{userId}:{orgId}` | LRU + Redis | **60s** | Active-membership re-validation | [get-tenant-id.ts:33](../packages/auth/get-tenant-id.ts#L33) |
| `appAccess:{userId}:{orgId}:{appSlug}` | LRU + Redis | **60s** | Per-app access gate | [get-tenant-id.ts:48](../packages/auth/get-tenant-id.ts#L48) |
| `firstActiveTenant:{userId}` | LRU + Redis | **60s** | Onboarding org fallback | [get-tenant-id.ts:69](../packages/auth/get-tenant-id.ts#L69) |
| `rl:{routeKey}\|{clientKey}:{windowStart}` | Redis (mem fallback) | `ceil(windowMs/1000)` | Fixed-window rate-limit counter | [rateLimit.ts:156](../packages/shared/lib/rateLimit.ts#L156) |
| `otp:reset:{userId}` | Redis (mem fallback) | **180s** | sha256(OTP) for password reset | [otp-store.ts:25](../apps/auth/lib/otp-store.ts#L25) |
| `otp:reset-attempts:{userId}` | Redis (mem fallback) | **180s** | Wrong-attempt counter (max 5) | [otp-store.ts:26](../apps/auth/lib/otp-store.ts#L26) |
| `otp:reset-token:{token}` | Redis (mem fallback) | **300s** | One-shot reset token → userId | [otp-store.ts:27](../apps/auth/lib/otp-store.ts#L27) |
| `oauth-prefill:{userId}` | Redis (mem fallback) | ~600s | OAuth first/last-name prefill | [packages/auth/oauth-prefill-store.ts](../packages/auth/oauth-prefill-store.ts) |
| `admin:perms:{orgId}:{userId}:{appId}` | Redis | 300s default | Admin permission set | [apps/admin/lib/redis.ts:40](../apps/admin/lib/redis.ts#L40) |
| `feature-flags:admin:{orgId}` | Redis | 300s | Admin feature flags | [apps/admin/lib/redis.ts:46](../apps/admin/lib/redis.ts#L46) |
| `auth:membership:{userId}:{orgId}` | Redis | 60s | Admin-app membership cache | [apps/admin/lib/redis.ts:47-48](../apps/admin/lib/redis.ts#L47-L48) |
| `memberships:list:{userId}` | Redis | 60s | All memberships for a user | [apps/admin/lib/redis.ts:49](../apps/admin/lib/redis.ts#L49) |
| `dashboard:stats:{orgId}` | Redis | 30s | Admin dashboard stats | [apps/admin/lib/redis.ts:50](../apps/admin/lib/redis.ts#L50) |
| `quikit:cache-invalidate` | Redis Pub/Sub **channel** | — | Cross-process invalidation signal | [cache.ts:34](../packages/auth/cache.ts#L34) |

> Values stored via `getOrSet` / the admin wrapper are **JSON-serialized**
> strings. `Set<string>` results (disabled modules) are stored as a JSON array
> and rehydrated into a `Set` after read.

---

## 6. Cache read/write flow

The single entry point for hot-read caching is `getOrSet`
([cache.ts:147-175](../packages/auth/cache.ts#L147-L175)):

```ts
export async function getOrSet<T>(key, ttlSeconds, loader): Promise<T> {
  ensureInvalidationSubscriber();            // lazy pub/sub bind on first use

  const local = localGet<T>(key);            // Layer 2: in-memory LRU
  if (local !== undefined) return local;     //   hit → instant return

  const remote = await redisGet<T>(key);     // Layer 3: shared Redis (JSON.parse)
  if (remote !== undefined) {
    localSet(key, remote, ttlSeconds);       //   backfill local so next call is instant
    return remote;
  }

  const fresh = await loader();              // Layer 4: DB / compute (miss)
  localSet(key, fresh, ttlSeconds);
  void redisSet(key, fresh, ttlSeconds);     //   fire-and-forget write to Redis
  return fresh;
}
```

Flow notes:

- **Read order:** local LRU → Redis → loader. A Redis hit **backfills** the local
  layer so subsequent same-process calls skip the network.
- **Write:** the local write is synchronous; the Redis write is
  **fire-and-forget** (`void redisSet`) — the value is already in hand, so the
  caller never waits on the upstream write.
- **LRU mechanics** ([cache.ts:77-105](../packages/auth/cache.ts#L77-L105)):
  a `Map` capped at `MAX_LOCAL_ENTRIES = 1000`. Reads re-insert the key (MRU
  refresh); overflow drops the oldest key (Map preserves insertion order).
  Expired entries are deleted on read.
- **Per-request layer:** for feature-gate calls, `getOrSet` sits *behind*
  `React.cache()`, so repeated calls in the same render (sidebar + layout gate +
  page) hit `getOrSet` once.

The Redis-only variant `cacheOrCompute`
([packages/shared/lib/redisCache.ts:28-68](../packages/shared/lib/redisCache.ts#L28-L68))
follows the same cache-aside shape for heavy GET responses, but has **no local
layer** — straight Redis get → compute → fire-and-forget set. On no-Redis it
computes every time; on a corrupted (unparseable) entry it recomputes.

---

## 7. Invalidation & refresh mechanisms

There are four distinct refresh mechanisms in the codebase:

### 7.1 Manual invalidation + cross-process pub/sub

`invalidate(key)` ([cache.ts:180-184](../packages/auth/cache.ts#L180-L184))
does three things:

```ts
export async function invalidate(key: string): Promise<void> {
  localDelete(key);              // drop this process's copy
  await redisDelete(key);        // delete the shared Redis key
  await publishInvalidation(key); // PUBLISH on "quikit:cache-invalidate"
}
```

Every process subscribes to `quikit:cache-invalidate` once (lazy) and deletes
its local copy on message ([cache.ts:57-61](../packages/auth/cache.ts#L57-L61)).
This makes an admin change (e.g. disabling a module) propagate across **all
instances within sub-second**, rather than waiting out the 30–60s TTL. The
canonical caller is the super-admin feature-flag toggle, which calls
`invalidateDisabledModules(orgId, appSlug)`
([feature-gate.ts:92-97](../packages/auth/feature-gate.ts#L92-L97)).

If pub/sub is unavailable, invalidation still works locally and peers fall back
to per-TTL eviction.

### 7.2 TTL expiry

Every cached entry carries a TTL (table in §5). Absent any explicit
invalidation, entries simply expire and the next read re-loads from the source.

### 7.3 React Query (client) invalidation

CRUD mutations invalidate the relevant query keys on success
([apps/quikscale/lib/hooks/createCRUDHook.ts](../apps/quikscale/lib/hooks/createCRUDHook.ts)):
create/update/delete call `queryClient.invalidateQueries({ queryKey: keys.lists() })`
(and the detail key, and a shared `["dashboard"]` key) so lists and dashboards
refetch after a write.

### 7.4 Next.js revalidation

Marketing/static routes use ISR (`export const revalidate = 60`); session-aware
routes opt out with `export const dynamic = "force-dynamic"`. See §10.

> **Caveat — admin pattern invalidation is a no-op.** `invalidatePermissionCache`
> / `invalidateUserPermissionCache` in
> [apps/admin/lib/redis.ts:58-76](../apps/admin/lib/redis.ts#L58-L76)
> are **intentionally empty** because `@quikit/redis` exposes no wildcard delete;
> the short per-key TTL is relied upon instead. Don't assume calling them clears
> anything.

---

## 8. Redis integration & usage

`@quikit/redis` is the single Redis surface. API:

| Function | Behavior |
|---|---|
| `getRedis(): Redis \| null` | Singleton client, or `null` when `REDIS_URL` unset. The basis of all graceful degradation. |
| `requireRedis(): Redis` | Throws if unavailable — for paths where silent fallback is worse than an error (distributed locks, auth rate limits). |
| `isRedisAvailable(): Promise<boolean>` | `PING` check (false if unset or PING fails). Used by readiness checks. |
| `closeRedis()` | Graceful `quit()` for shutdown hooks. |
| `cacheGet / cacheSet / cacheDel` | Best-effort string get/set(EX)/del; swallow errors and return null/void on failure. |

Higher layers build on these: `@quikit/auth/cache` adds JSON (de)serialization,
the in-memory LRU, and pub/sub; `apps/admin/lib/redis.ts` adds typed JSON
wrappers with a 300s default TTL.

**Pub/sub uses a dedicated connection.** ioredis requires a separate connection
for subscriber mode, so the invalidation subscriber is created via
`main.duplicate()` ([cache.ts:46-65](../packages/auth/cache.ts#L46-L65))
— this keeps regular commands from being blocked by subscribe state. Subscriber
errors are swallowed.

---

## 9. Session caching flow

Sessions are JWT-based, with a Redis handle used for **soft revocation**. The
store is [`packages/auth/session-store.ts`](../packages/auth/session-store.ts);
the key is `auth:session:{sessionId}`.

| Function | Redis op | Fallback when Redis down |
|---|---|---|
| `createAuthSession(userId, ttl)` | `SET … EX ttl` (value `{userId, createdAt}`) | returns a local UUID; login still works |
| `touchAuthSession(sessionId, ttl)` | `EXPIRE` (slide the TTL for active users) | no-op |
| `isAuthSessionActive(sessionId)` | `EXISTS` | **returns `true` (fails open)** |
| `revokeAuthSession(sessionId)` | `DEL` | no-op |

### Lifecycle

```
 login          → createAuthSession(userId, 30d)      [SET auth:session:<id> EX 2592000]
 activity       → touchAuthSession(<id>, 30d)          [EXPIRE — keeps active users alive]
 each check     → isAuthSessionActive(<id>)            [EXISTS — gates JWT validity]
 logout/revoke  → revokeAuthSession(<id>)              [DEL — next check fails]
```

The JWT itself carries the `sessionId`. On a protected navigation, the auth
chain decodes the JWT and checks `isAuthSessionActive`; if the session key is
gone (logout, admin revoke, TTL expiry), the token is treated as invalid and the
user is bounced to login with their cookies cleared. The central auth app
exposes `/api/verify-token` so sibling apps' middleware can remote-validate the
session against Redis (guarded by `INTERNAL_SECRET`); see
[`packages/auth/middleware.ts`](../packages/auth/middleware.ts),
[`packages/auth/jwt.ts`](../packages/auth/jwt.ts), and
[`apps/auth/app/api/verify-token/route.ts`](../apps/auth/app/api/verify-token/route.ts).

> **Operational nuances to know:**
> - `isAuthSessionActive` **fails open** — if Redis is unreachable, the session
>   is treated as active. So a Redis outage disables cross-instance revocation
>   (users keep access until the JWT's own expiry).
> - The remote session-revoke wiring is fully present on the **central
>   credentials path**; consumer OAuth-client apps may not carry a `sessionId`,
>   in which case the EXISTS check has nothing to revoke. Verify the JWT actually
>   carries `sessionId` before relying on remote revocation for a given app.

---

## 10. API caching flow

API requests touch several cache surfaces:

**1. Tenant resolution (every authenticated call).** `createGetOrgId`
([get-tenant-id.ts](../packages/auth/get-tenant-id.ts)) trusts the JWT's
`orgId` for identity but re-validates the membership row (and optionally
`UserAppAccess`) through `getOrSet`, caching `membership:*`/`appAccess:*`/
`firstActiveTenant:*` for 60s.

**2. Feature gates.** `gateModuleApi(appSlug, moduleKey, orgId)`
([feature-gate.ts:145-167](../packages/auth/feature-gate.ts#L145-L167))
runs the hard `isTenantAppBlocked` check (403) first, then `getDisabledModules`
(404 if disabled). `gateModuleRoute` is the server-component equivalent
(redirects). Both read through React.cache → LRU → Redis.

**3. Rate limiting.** `rateLimitAsync`
([rateLimit.ts:132-181](../packages/shared/lib/rateLimit.ts#L132-L181))
implements a **fixed-window** limiter using Redis `INCR` + `EXPIRE` on
`rl:{routeKey}|{clientKey}:{windowStart}`. It is **fail-open** by default
(falls back to the in-memory `MemoryRateLimitStore`); auth-critical callers pass
`failClosed: true` to block when Redis is unavailable. Preset policies
([rateLimit.ts:200-204](../packages/shared/lib/rateLimit.ts#L200-L204)):

```ts
LIMITS = {
  login:    { limit: 10, windowMs: 15 * 60 * 1000 },  // 10 / 15 min
  kpiWrite: { limit: 30, windowMs: 60 * 1000 },       // 30 / min
  mutation: { limit: 60, windowMs: 60 * 1000 },       // 60 / min
}
```

> ⚠️ The synchronous `rateLimit()` is **in-memory, single-process only** — never
> safe in multi-instance production (counters are per-process and bypassable via
> round-robin). Use `rateLimitAsync()` in production code.

**4. Heavy GET responses.** `cacheOrCompute(key, ttl, compute)`
([redisCache.ts](../packages/shared/lib/redisCache.ts)) caches expensive
aggregates/analytics in Redis (no local layer).

**5. HTTP cache headers (quikinfra).**
[`apps/quikinfra/src/lib/http/cache.ts`](../apps/quikinfra/src/lib/http/cache.ts)
sets tiered `Cache-Control` (`private, max-age=…, stale-while-revalidate=…`) on
master-data GETs with `Vary: Cookie`, while mutating routes return `no-store`.
quikinfra also has DB-backed idempotency
([src/lib/workflow/idempotency.ts](../apps/quikinfra/src/lib/workflow/idempotency.ts)).

**6. Next.js data cache / ISR.** Marketing pages use `export const revalidate = 60`
(e.g. `/[slug]`, `/blog`); session-reading pages and health/OAuth routes use
`export const dynamic = "force-dynamic"` so they're never statically cached.

---

## 11. Middleware & utility functions

| Function | Package / file | Role |
|---|---|---|
| `getRedis` / `requireRedis` / `isRedisAvailable` / `closeRedis` | `@quikit/redis` | Client lifecycle & health |
| `cacheGet` / `cacheSet` / `cacheDel` | `@quikit/redis` | Best-effort raw string ops |
| `getOrSet` / `invalidate` / `_clearLocalCache` / `isRedisCacheEnabled` | `@quikit/auth/cache` | Layered get-or-load + invalidation |
| `getDisabledModules` / `isTenantAppBlocked` / `gateModuleRoute` / `gateModuleApi` / `gateTenantAppRoute` / `invalidateDisabledModules` | `@quikit/auth/feature-gate` | Module / app gating |
| `createGetOrgId` (alias `createGetTenantId`) | `@quikit/auth/get-tenant-id` | Tenant resolution + membership/app-access cache |
| `createAuthSession` / `touchAuthSession` / `isAuthSessionActive` / `revokeAuthSession` | `@quikit/auth/session-store` | Session soft-revocation |
| `rateLimit` / `rateLimitAsync` / `getClientIp` / `LIMITS` | `@quikit/shared/rateLimit` | Rate limiting |
| `cacheOrCompute` / `invalidate` | `@quikit/shared/redisCache` | Redis-only cache-aside |
| `cacheGet` / `cacheSet` / `CacheKeys` / `invalidate*` | `apps/admin/lib/redis.ts` | Admin typed JSON cache |

Middleware itself (`createMiddleware` from `@quikit/auth/middleware`, mandated by
root `CLAUDE.md`) uses Redis indirectly via the remote verify-token path — it
does not cache directly, but its session validity decision depends on
`isAuthSessionActive`.

---

## 12. Environment variables

| Variable | Scope | Role | Dev | Prod |
|---|---|---|---|---|
| `REDIS_URL` | server | The **only** cache-critical env. When unset, every cache degrades to in-memory-per-instance | `redis://localhost:6379` | `rediss://…` (TLS, e.g. Upstash) |
| `NODE_ENV` | server | Gates the loud one-time Redis error banner (prod only) | `development` | `production` |
| `NEXT_PUBLIC_DASHBOARD_REFRESH_MS` | client | Quikcrm dashboard auto-refetch interval (default 60000; `0` disables) | — | optional |
| `INTERNAL_SECRET` | server | Not a cache var per se, but guards the remote `/api/verify-token` session check | shared | shared |

Notes:

- `REDIS_URL` is declared in the build `env` list in
  [turbo.json](../turbo.json) so Turbo's cache busts when it changes.
- There are **no `*_CACHE_TTL` env vars** — all TTLs are constants in code (see
  §5). Tuning a TTL is a code change, not a config change.
- In multi-instance prod, **all apps must share the same `REDIS_URL`** for
  cross-instance session revocation and cache invalidation to work, and the same
  `NEXTAUTH_SECRET` to trust each other's JWTs.

---

## 13. Folder structure & file responsibilities

```
packages/
├── redis/
│   └── index.ts                  # ioredis singleton + getRedis/requireRedis/
│                                 #   isRedisAvailable/closeRedis + cacheGet/Set/Del
├── auth/
│   ├── cache.ts                  # layered LRU+Redis getOrSet/invalidate + pub/sub
│   ├── feature-gate.ts           # getDisabledModules / isTenantAppBlocked / gate*
│   ├── get-tenant-id.ts          # createGetOrgId — membership/appAccess/firstTenant cache
│   ├── session-store.ts          # auth:session:* create/touch/check/revoke
│   ├── oauth-prefill-store.ts    # oauth-prefill:* (Redis + Map fallback)
│   ├── jwt.ts                    # verifyJWT → checks isAuthSessionActive
│   └── middleware.ts             # createMiddleware (remote verify-token path)
└── shared/lib/
    ├── rateLimit.ts              # fixed-window limiter (Redis INCR + mem fallback)
    └── redisCache.ts             # cacheOrCompute (Redis-only cache-aside)

apps/
├── admin/lib/redis.ts            # typed JSON wrapper + CacheKeys + TTL constants
├── auth/lib/otp-store.ts         # otp:reset* / otp:reset-token* (Redis + Map fallback)
├── quikscale/lib/hooks/createCRUDHook.ts   # React Query keys + invalidateQueries
├── quikinfra/src/lib/http/cache.ts          # HTTP Cache-Control tiers + Vary: Cookie
└── quikinfra/src/lib/workflow/idempotency.ts # DB-backed idempotency keys
```

| File | Responsibility |
|---|---|
| `packages/redis/index.ts` | The only Redis connection; graceful-degradation contract |
| `packages/auth/cache.ts` | Hot-read cache + cross-process invalidation |
| `packages/auth/feature-gate.ts` | FF-1 module gates + SA-A.6 app block, React.cache-deduped |
| `packages/auth/get-tenant-id.ts` | Per-request tenant resolution with 60s caches |
| `packages/auth/session-store.ts` | JWT soft-revocation handle in Redis |
| `packages/shared/lib/rateLimit.ts` | Distributed fixed-window limiter |
| `packages/shared/lib/redisCache.ts` | Redis-only cache for heavy aggregates |
| `apps/admin/lib/redis.ts` | Admin typed-JSON cache + key builders |
| `apps/auth/lib/otp-store.ts` | Password-reset OTP + one-shot token store |

---

## 14. Data-flow diagrams

### 14.1 Feature-flag toggle propagation

```
 Super admin toggles module in Settings
   └─► POST /api/super/feature-flags/[appSlug]/toggle
         ├─ db.appModuleFlag.upsert(...)                       (source of truth)
         └─ invalidateDisabledModules(orgId, appSlug)
              ├─ localStore.delete("disabledModules:org:app")  (this pod)
              ├─ cacheDel(...)                                  (Redis)
              └─ PUBLISH quikit:cache-invalidate "disabledModules:org:app"
                    └─► every other pod's subscriber deletes its local copy
 Next request anywhere → getDisabledModules → miss → DB → fresh set (sub-second)
 (Absent the toggle/invalidate, the 30s TTL would eventually refresh anyway.)
```

### 14.2 Session revoke → bounce

```
 logout / admin revoke → revokeAuthSession(sessionId)  → DEL auth:session:<id>
 next protected nav:
   middleware → verify-token → verifyJWT → isAuthSessionActive(<id>)
        └─ EXISTS = 0 → token invalid → clear cookies → redirect to central /login
 (Redis down → isAuthSessionActive fails OPEN → user keeps access until JWT exp.)
```

### 14.3 Cache miss → DB → backfill

```
 getDisabledModules(org, app)
   React.cache hit? ── yes → return (no further work this request)
        │ no
   getOrSet:
     localGet ── hit → return
        │ miss
     redisGet ── hit → localSet (backfill) → return
        │ miss
     loader() = db.appModuleFlag.findMany(...) → localSet + fire-and-forget redisSet → return
```

---

## 15. Debugging & troubleshooting

| Symptom | Likely cause | Where to look / fix |
|---|---|---|
| Module toggle doesn't take effect for ~30s | Toggle route didn't call `invalidateDisabledModules`; relying on 30s TTL only | Confirm the toggle route invalidates; check pub/sub is connected (`quikit:cache-invalidate`) — [feature-gate.ts:92-97](../packages/auth/feature-gate.ts#L92-L97) |
| Logout / revoke doesn't lock the user out | `isAuthSessionActive` failing open (Redis down) **or** the JWT carries no `sessionId` on that app | Verify `REDIS_URL` is set & reachable; confirm the app's JWT includes `sessionId` — [session-store.ts:57-66](../packages/auth/session-store.ts#L57-L66) |
| Rate limit seems bypassable under load | Using sync `rateLimit()` (per-process) or Redis down with default fail-open | Switch to `rateLimitAsync()`; for auth routes pass `failClosed: true` — [rateLimit.ts:104-118](../packages/shared/lib/rateLimit.ts#L104-L118) |
| Calling `invalidatePermissionCache` clears nothing | It's an intentional **no-op** (no wildcard delete in `@quikit/redis`) | Rely on the short TTL, or delete exact keys via `CacheKeys` — [apps/admin/lib/redis.ts:58-76](../apps/admin/lib/redis.ts#L58-L76) |
| `[redis] CRITICAL: REDIS_URL is not set in production` in logs | `REDIS_URL` missing in prod env | Set it in the deploy environment; everything degrades to in-memory-per-instance until then — [index.ts:36-40](../packages/redis/index.ts#L36-L40) |
| Stale value persists across pods but clears on one | Pub/sub subscriber failed to bind (swallowed); peers on per-TTL eviction | Check Redis pub/sub connectivity; the subscriber is best-effort — [cache.ts:51-56](../packages/auth/cache.ts#L51-L56) |
| Cached read returns `undefined`/recomputes every time | Corrupted/non-JSON Redis entry, or value was never JSON | `redisGet`/`cacheOrCompute` swallow parse errors and recompute — [cache.ts:111-119](../packages/auth/cache.ts#L111-L119) |
| Marketing/page content stale up to a minute | ISR `revalidate = 60` | Expected; lower `revalidate` or use `force-dynamic` if it must be live |

**General steps:** (1) confirm `REDIS_URL` and run a `PING` (`isRedisAvailable()`);
(2) check for the one-time prod banner in function logs; (3) for "stale across
instances," verify all pods share one `REDIS_URL` and pub/sub is up; (4) for a
specific key, `redis-cli GET <key>` / `TTL <key>` to inspect value and expiry;
(5) remember reads go local-first — `_clearLocalCache()` exists for tests.

---

## 16. Best practices, failure impact & fallback

### Principles currently followed

1. **Fail-open for caches, fail-closed only where it matters.** `getOrSet`,
   feature gates, and `isAuthSessionActive` all fail open. Only auth-critical
   rate limits opt into `failClosed`.
2. **Short TTLs bound staleness.** 30–60s for auth/permission data; 5 min for
   admin permission/flag sets; minutes for OTP/reset tokens. The accepted cost
   is "stale access for up to one TTL after an admin change."
3. **Per-request dedup first.** Wrap hot auth reads in `React.cache()` so a
   single render/handler hits the layered cache once, not per component.
4. **One key string per domain.** Build keys in the same module that reads them
   (and derive the invalidation key the same way) so read and bust can't drift.
5. **Pub/sub for instant cross-pod invalidation**, with TTL as the safety net if
   pub/sub is unavailable.
6. **Fire-and-forget writes.** Never block a response on a cache write.
7. **Redis is optional in dev.** Don't write code that hard-requires Redis on
   non-critical paths — use `getRedis()` + fallback, reserve `requireRedis()`
   for paths where a silent fallback is dangerous.

### What breaks when Redis is down (and the fallback)

| Capability | Behavior without Redis | Net impact |
|---|---|---|
| Hot-read auth cache (`getOrSet`) | Falls back to in-memory LRU per process | Works, but no cross-instance sharing; more DB hits across pods |
| Cross-process invalidation | Pub/sub unavailable → per-TTL eviction only | Admin changes take up to the TTL (30–60s) to fully propagate |
| Session revocation | `isAuthSessionActive` returns `true` (fail-open) | Revocation can't take effect across instances; users keep access until JWT `exp` |
| Distributed rate limiting | In-memory per-process (or block if `failClosed`) | Limits become per-pod and bypassable, unless `failClosed` rejects |
| OTP / reset tokens | Process-local `Map` fallback | Works on a single instance; breaks across instances (token minted on pod A unknown to pod B) |
| `cacheOrCompute` aggregates | Always recompute | Correct but slower (no caching) |
| Admin typed cache | `getRedis()` null → reads miss, writes no-op | Correct, uncached |

The consistent theme: **correctness is preserved, coordination and performance
degrade.** A missing `REDIS_URL` in production is therefore a real incident (it
emits the loud banner) even though the apps keep serving traffic.

---

### Source references (verified)

- Redis client: [packages/redis/index.ts](../packages/redis/index.ts)
- Layered cache + pub/sub: [packages/auth/cache.ts](../packages/auth/cache.ts)
- Feature gates: [packages/auth/feature-gate.ts](../packages/auth/feature-gate.ts)
- Tenant resolution: [packages/auth/get-tenant-id.ts](../packages/auth/get-tenant-id.ts)
- Session store: [packages/auth/session-store.ts](../packages/auth/session-store.ts)
- Rate limiter: [packages/shared/lib/rateLimit.ts](../packages/shared/lib/rateLimit.ts)
- Redis-only cache: [packages/shared/lib/redisCache.ts](../packages/shared/lib/redisCache.ts)
- OTP store: [apps/auth/lib/otp-store.ts](../apps/auth/lib/otp-store.ts)
- Admin cache wrapper: [apps/admin/lib/redis.ts](../apps/admin/lib/redis.ts)
- Build env: [turbo.json](../turbo.json)
