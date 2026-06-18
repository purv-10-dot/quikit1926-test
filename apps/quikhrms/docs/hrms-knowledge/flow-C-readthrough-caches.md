# Flow C — Read-Through Caches (Code → Redis → Postgres)

Traced from actual source on branch `gourav-uat-hrms`. This documents the six
read-through caches that ride the HRMS hot path: where each is read, the loader
that hits Postgres on a miss, the TTL, what busts it, and the screen behind it.

---

## 0. The cache mechanism (read this first)

### Files
- `apps/quikhrms/src/lib/services/cache.ts` — thin facade. `getCached(key, ttlSec, loader)` → `getOrSet`; `invalidateKeys(...keys)` → `invalidate` per key. Also exports `cacheKeys` builders.
- `packages/auth/cache.ts` — the real layered cache (`getOrSet`, `invalidate`).
- `packages/redis/index.ts` — `@quikit/redis`: `getRedis()` (null when `REDIS_URL` unset), `cacheGet/cacheSet/cacheDel` (best-effort, swallow errors).

### Layering — `getOrSet(key, ttlSeconds, loader)` (`packages/auth/cache.ts:147-175`)
The order is **LRU → Redis → loader**:

1. **Layer 1 — in-memory LRU** (`localGet`, `cache.ts:89-100`). `Map` of `{value, expiresAt}`, max 1000 entries, oldest-evicted. Per-process, instant, always on. If present and not expired → return immediately.
2. **Layer 2 — shared Redis** (`redisGet` → `cacheGet`, `cache.ts:111-119`). JSON-parsed. On hit, **backfills the LRU** with the same TTL (`localSet`, line 165) and returns.
3. **MISS — loader runs** (`cache.ts:170-173`). The loader is the only thing that touches Postgres (or central HTTP). Its result is written to the **LRU synchronously** (`localSet`) and to **Redis fire-and-forget** (`void redisSet`). Next call is hot.

`getOrSet` **fails open**: a Redis error in `redisGet` is caught and treated as a miss (`cache.ts:116-118`), so a broken cache degrades to "always run the loader," never an auth/data failure.

### What "expiry" means at each layer
- **LRU**: `expiresAt = now + ttl*1000`. `localGet` deletes and returns `undefined` once `expiresAt < Date.now()` (`cache.ts:92-95`) → falls through to Redis.
- **Redis**: written with `SET key val EX ttlSeconds` (`packages/redis/index.ts:161`). Redis itself drops the key at TTL; `cacheGet` then returns `null` → treated as a miss → loader re-runs.
- **In all cases, expiry/miss = the loader re-runs the Postgres query and re-populates both layers.** This is the DB fallback.

### Invalidation — `invalidate(key)` (`cache.ts:180-184`)
1. `localDelete(key)` — drop this process's LRU copy.
2. `await redisDelete(key)` — `DEL` the Redis key.
3. `await publishInvalidation(key)` — `PUBLISH quikit:cache-invalidate <key>`.

Every process lazily subscribes to `quikit:cache-invalidate` on first cache touch (`ensureInvalidationSubscriber`, `cache.ts:39-65`) and on receipt does `localStore.delete(key)` (line 59). **This is the cross-instance bust** — without it, peer pods would serve a stale LRU copy until their own TTL elapsed.

**There is NO wildcard delete.** Invalidation is exact-key only — every cached read must have a derivable invalidation key, or it can only age out by TTL.

### Degraded mode (no Redis, `REDIS_URL` unset)
`getRedis()` returns `null` (`packages/redis/index.ts:59-64`); all Redis get/set/del/publish become no-ops, and the subscriber never starts. The cache collapses to **per-process LRU only**. Correctness is identical (loader still runs on miss); the only losses are cross-instance sharing and cross-instance invalidation — a peer pod ages out within the entry's TTL instead of being told to evict.

---

## 1. Permissions — `perms:{orgId}:{userId}`, TTL 300s

- **What is cached**: a `CachedPerms` object `{ roleCode, permissions: string[], mustChangePassword, preBoarding }` — the user's effective RBAC permission set. Key `cacheKeys.permissions(orgId, userId)` = `perms:{orgId}:{employeeId}` (`cache.ts:35`). TTL `PERM_CACHE_TTL_SEC = 300` (`with-auth.ts:215`).

- **Read flow** (`resolvePermissions`, `with-auth.ts:247-340`):
  1. Every authenticated request → `withAuth` → `resolvePermissions(orgId, userId)` → `getCached(perms:…, 300, loader)`.
  2. (a) LRU hit → return the perm object.
  3. (b) Redis hit → backfill LRU → return.
  4. (c) MISS → loader runs Postgres queries:
     - `prisma.employee.findFirst` (table **Employee**) for `mustChangePassword` + `status` (`with-auth.ts:252-259`).
     - `prisma.userAppRole.findMany` (table **UserAppRole** → joined **AppRole** → **RolePermission**), filtered to non-expired roles (`with-auth.ts:266-281`).
     - `prisma.userPermissionExtra.findMany` (table **UserPermissionExtra**) for per-user grant/deny (`with-auth.ts:282-286`).
     - Fallback to the tenant default `AppRole` if the user has no role rows (`with-auth.ts:292-302`).
     - Unions role perms + extras, applies DENYs last; `admin` → `["*"]`.
  5. Result stored back into Redis + LRU.

- **On expiry / miss**: the loader re-runs the UserAppRole/RolePermission/UserPermissionExtra queries and re-populates both layers.

- **Invalidation** — `invalidatePermissionCache(orgId, userId?)` (`with-auth.ts:364-383`):
  - Per-user (`userId` given): busts the one `perms:` key.
  - Tenant-wide (`userId` omitted): **no wildcard** — enumerates every `UserAppRole.userId` in the tenant and busts each `perms:` key, chunked 100 at a time (`with-auth.ts:373-382`).
  - Callers (write paths that change RBAC):
    - `settings/roles/[id]/route.ts:78,117` (role edit/delete) — tenant-wide.
    - `settings/roles/[id]/permissions/route.ts:46`, `settings/roles/[id]/navigation/route.ts:69` — tenant-wide.
    - `employees/[id]/role/route.ts:71`, `employees/bulk-role/route.ts:65`, `employees/[id]/permissions/route.ts:111`, `employees/[id]/confirm/route.ts:86`, `employees/[id]/temp-password/route.ts:42`, `employees/[id]/route.ts:208` — per-user.
    - `cron/preboarding-auto-activate/route.ts:44` — per-user (PreBoarding → Active widens perms).
    - `central-sync.ts:133` (central role transition) and logout (see §4) — per-user.
  - Cross-instance bust: `invalidate` publishes each key on `quikit:cache-invalidate`; peer pods drop their LRU copy.

- **Screen impact**: the **sidebar navigation** + any permission-gated UI. The browser reads perms from `GET /api/v1/hrms/dashboard/config` → that route returns `authCtx.permissions` straight from `withAuth` (`dashboard/config/route.ts:16,64`), and `useDashboardConfig` (`src/lib/hooks/use-dashboard-config.ts`) feeds `sidebar.tsx:278` (`hasAnyPermission`, `permissions.includes("*")`). So the perm cache backs which nav items render. **Stale-for-up-to-300s is acceptable** by design (the cache header in `packages/auth/cache.ts:11-13` states the trade-off); admin RBAC writes bust it immediately, and the client `useQuery` also has a 30s `staleTime`.

---

## 2. employee-me — `employee-me:{orgId}:{userId}`, TTL 300s

- **What is cached**: the caller's own profile card object (id, employeeCode, name, jobTitle, profilePhoto, status, reportingManagerId, department, designation, primary role). Key `cacheKeys.employeeMe` = `employee-me:{orgId}:{employeeId}` (`cache.ts:34`). TTL `300` (hardcoded at the call site, `employees/me/route.ts:13`).

- **Read flow** (`GET /api/v1/hrms/employees/me`, `employees/me/route.ts:9-48`):
  1. Request → `withAuth` → `getCached(employee-me:…, 300, loader)`.
  2. (a) LRU hit → return. (b) Redis hit → backfill LRU → return.
  3. (c) MISS → loader: `resolveEmployeeId(orgId, userId)` then `prisma.employee.findFirst` (table **Employee**, joined **Department**, **Designation**, **UserAppRole→AppRole**) (`employees/me/route.ts:17-30`); shapes `role.{code,name,priority}`.
  4. Stored back into Redis + LRU.

- **On expiry / miss**: the loader re-runs the `employee.findFirst` Postgres query and re-populates.

- **Invalidation**:
  - Logout — `invalidateUserAuthCaches` busts `employee-me:` (`with-auth.ts:413`).
  - Central-sync suspend/reactivate — `applyCentralState` busts `employee-me:` (`central-sync.ts:104,118`).
  - **GAP / stale-screen risk**: ordinary profile edits do **not** appear to bust this key. `employees/[id]/route.ts` (PUT) busts only `perms:` (line 208), not `employee-me:`. So a name / photo / job-title / department change is stale in the top-bar + user menu for up to **300s** (plus the client's 5-min `staleTime`).

- **Screen impact**: the **top bar** (`top-bar.tsx:36-41`, `TopBar` greeting + `UserMenu` avatar/name/title) and `NotificationBell`'s owner data. Reads via `useQuery(["me","topbar"])` against `/employees/me` with `staleTime: 5*60_000`. A 300s-stale profile is mostly cosmetic, but combined with the missing invalidation it means an admin-edited or self-edited profile can lag visibly until both the server TTL and client staleTime lapse.

---

## 3. notif-unread — `notif-unread:{orgId}:{userId}`, TTL 15s (NOT 300)

- **What is cached**: an integer — the count of unread Notification rows for the caller. Key `cacheKeys.notifUnread` = `notif-unread:{orgId}:{employeeId}` (`cache.ts:36`). **TTL is `15`** at the call site (`notifications/unread-count/route.ts:11`) — the prompt's "TTL unspecified" resolves to 15s, deliberately short "since SSE invalidates on new notification."

- **Read flow** (`GET /api/v1/hrms/notifications/unread-count`, `unread-count/route.ts:7-19`):
  1. Request → `withAuth` → `getCached(notif-unread:…, 15, loader)`.
  2. (a) LRU hit / (b) Redis hit (backfill LRU) → return `{count}`.
  3. (c) MISS → loader: `prisma.notification.count({ where: { orgId, employeeId: userId, isRead: false } })` (table **Notification**).
  4. Stored back into Redis + LRU.

- **On expiry / miss**: the loader re-runs the `notification.count` query and re-populates.

- **Invalidation** — busts `notif-unread:` only on the caller's own read-state changes:
  - `notifications/[id]/read/route.ts:19` (mark one read).
  - `notifications/read-all/route.ts:13` and `notifications/route.ts:60` (PATCH mark-all).
  - Logout — `invalidateUserAuthCaches` (`with-auth.ts:414`).
  - **GAP / stale-screen risk**: notification **creation** does NOT bust the recipient's key. `POST /api/v1/hrms/notifications` (`notifications/route.ts:39-51`) and the service-layer `prisma.notification.createMany` (e.g. `src/lib/services/task-notifications.ts:34`, plus payroll/ticket/form12bb/content-moderation notifiers) create rows with no `invalidateKeys`. A new notification is therefore invisible in the badge for up to **15s** (TTL only). The route comment claims "SSE invalidates on new notification," but the invalidation is the short TTL, not an explicit bust on create — the 15s TTL is what bounds the staleness.

- **Screen impact**: the red **unread badge** on the bell (`top-bar.tsx:105-110,203-207`). Reads via `useQuery(["notifications","unread-count"])` with `staleTime: 60_000`. Marking read is optimistic on the client and busts the server key on settle; new-notification arrival relies on the 15s server TTL + the client refetch. Stale-for-up-to-15s on a count badge is acceptable.

---

## 4. session-valid — `session-valid:{authUserId}`, TTL 60s

- **What is cached**: an **auth verdict**, not data — a `boolean` (`true` = session still valid centrally). Key built inline `session-valid:${authUserId}` (`with-auth.ts:131`); `authUserId` is the central SSO subject (`token.id`), tenant-agnostic. TTL `SESSION_REVALIDATE_TTL_SEC = 60` (`with-auth.ts:20`).

- **Read flow** (`resolveIdentity`, `with-auth.ts:128-139`, runs only when `AUTH_URL` + `INTERNAL_SECRET` are set):
  1. Every request with a central JWT → `getCached(session-valid:…, 60, loader)`.
  2. (a) LRU hit / (b) Redis hit → return the cached boolean.
  3. (c) MISS → loader = `verifyTokenRemote({ authUrl, internalSecret, cookie })` (`packages/auth/verify-token-remote.ts:23-54`) — an **HTTP GET to central `/api/verify-token`**, NOT a local Postgres query. Maps `r.error → true` (**fail-open**: central unreachable/misconfigured does not lock everyone out) and `r.valid → true/false` (`false` = revoked/expired centrally).
  4. Verdict stored back into Redis + LRU. If `!stillValid` → `resolveIdentity` returns `null` → `withAuth` 401 → client bounces to `/login`.

- **On expiry / miss**: the loader re-runs the central `verifyTokenRemote` HTTP call and re-populates. The "DB fallback" here is the **central auth service** (HRMS has a separate DB and cannot read the central session table directly), accessed over HTTP and failing open.

- **Invalidation**:
  - Logout — `invalidateUserAuthCaches(authUserId, …)` busts `session-valid:` first (`with-auth.ts:402`), so the very next request re-checks central auth instead of trusting the 60s window. This is the security-relevant bust (file comment, `with-auth.ts:388-392`).
  - Otherwise it self-heals within 60s (a central revoke propagates to HRMS within ≤60s).
  - Cross-instance: published on `quikit:cache-invalidate`.

- **Screen impact**: indirect — no widget reads it. A revoked/expired central session keeps working in HRMS for up to 60s, then any request 401s and the client redirects to `/login`. Stale-for-up-to-60s on an auth verdict is the documented trade-off (fail-open beats locking everyone out on a transient central outage).

- **Degraded (no Redis)**: per-process LRU only; each pod independently re-verifies against central every 60s. Correctness identical; a logout bust only reaches the local process (peers age out in ≤60s).

---

## 5. central-member — `central-member:{orgId}:{authUserId}`, TTL 120s

- **What is cached**: a `boolean` membership-sync verdict (`true` = user still has live central HRMS access). Key `centralSyncCacheKey(orgId, authUserId)` = `central-member:{orgId}:{authUserId}` (`central-sync.ts:43-44`). TTL `CENTRAL_SYNC_TTL_SEC = 120` (`central-sync.ts:38`).

- **Read flow** (`syncCentralMembership`, `central-sync.ts:57-72`, called from `resolveIdentity`, `with-auth.ts:156`):
  1. Every request (after identity resolves) → `getCached(central-member:…, 120, loader)` (no-ops to `true` if `QUIKIT_URL`/`INTERNAL_SECRET` unset).
  2. (a) LRU hit / (b) Redis hit → return the verdict.
  3. (c) MISS → loader = `memberLookupRemote({ orgId, appSlug:"quikhrms", userIds:[authUserId] })` (`packages/auth/member-lookup-remote.ts:47-85`) — **HTTP POST to central `/api/internal/members/lookup`** (reads the LIVE central DB, since the JWT is stale). On `!lookup.ok` → returns `true` (**fail-open**). Otherwise `applyCentralState` (`central-sync.ts:79-143`) reconciles the local **Employee** row:
     - No live access → set Employee `status:"Suspended"` + `centralDeactivatedAt`, **busts `perms:` and `employee-me:`** (`central-sync.ts:98-105`), returns `false`.
     - Restored after sync-suspension → set `Active`, bust `perms:` + `employee-me:` (`central-sync.ts:113-120`).
     - Central role transition → `remapHrmsRole` (UserAppRole upsert/delete) + bust `perms:` (`central-sync.ts:131-133`).
  4. Verdict stored back into Redis + LRU. `false` → `resolveIdentity` returns `null` → 401 → `/login`.

- **On expiry / miss**: the loader re-runs the central `memberLookupRemote` HTTP call (and any reconciling Employee writes) and re-populates. The "DB fallback" is the **central QuikIT DB** over HTTP, not the local HRMS DB.

- **Invalidation**:
  - Logout — `invalidateUserAuthCaches` busts `centralSyncCacheKey(orgId, authUserId)` (`with-auth.ts:405`).
  - Otherwise self-heals within 120s (central removal/role change propagates within ≤120s).
  - Note: the verdict key itself isn't busted by the Employee writes inside `applyCentralState`; those write paths bust the *downstream* `perms:`/`employee-me:` keys so the new role/status is seen, while the sync verdict legitimately stays cached until its 120s TTL.

- **Screen impact**: indirect — a centrally-removed or app-access-revoked user keeps HRMS access for up to 120s, then 401s to `/login`. A central role change (member↔org_admin) re-maps the HRMS role and busts `perms:`, so the sidebar reflects it on the next perms-cache miss. Stale-for-up-to-120s acceptable (same fail-open rationale as §4).

---

## 6. Active leave policy — `leave-policy-active:{orgId}`, TTL 300s

> **Naming correction**: the prompt calls this `active-policy:{orgId}`. The actual key in code is **`leave-policy-active:${orgId}`** (`leave-policy-engine.ts:25-27`).

- **What is cached**: an array of `CachedPolicy` candidates (approvedRules JSON + appliesTo filters + effective dates) for the tenant's Active leave policies. TTL `CACHE_TTL_SEC = 300` (`leave-policy-engine.ts:14`).

- **Read flow** (`resolveActivePolicyRules`, `leave-policy-engine.ts:432-459`, called from the leave-request create path before evaluating rules):
  1. Apply-leave submission → `getCached(leave-policy-active:…, 300, loader)`.
  2. (a) LRU hit / (b) Redis hit (backfill LRU) → return the candidate array.
  3. (c) MISS → loader = `loadCandidatePoliciesFromDb(orgId)` (`leave-policy-engine.ts:404-430`): `prisma.leavePolicy.findMany({ where: { orgId, status:"Active", deletedAt:null }, orderBy:[effectiveFrom desc, updatedAt desc] })` (table **LeavePolicy**).
  4. Stored back into Redis + LRU. Caller then filters by effective-date + dept/role/employment-type and `parseRules` the first match (`leave-policy-engine.ts:442-457`).

- **On expiry / miss**: the loader re-runs the `leavePolicy.findMany` Postgres query and re-populates. (Note: only the *policy candidates* are cached; the per-request balance/overlap/cap checks in `evaluateLeavePolicy` always hit Postgres fresh — `checkOverlap`, `checkBalance`, `checkMonthlyYearlyCaps`, `checkClubbing`, lines 221-390.)

- **Invalidation** — `invalidateLeavePolicyCache(orgId)` busts `leave-policy-active:{orgId}` (`leave-policy-engine.ts:29-31`). Callers (every policy write):
  - `leaves/policies/route.ts:74` (create).
  - `leaves/policies/[id]/route.ts:64,86` (update/delete).
  - `leaves/policies/[id]/approve/route.ts:41` (approve — makes it Active).
  - `leaves/policies/[id]/extract/route.ts:115` (AI rule extraction).
  - Cross-instance: published on `quikit:cache-invalidate`.

- **Screen impact**: no direct widget — it backs the **server-side leave-policy validation** on the Apply-Leave submit path (blocks/warns shown after submit). An admin editing a policy busts the cache immediately, so a new rule takes effect on the next submission; absent any write, a policy change made directly in the DB is stale for up to 300s. Acceptable — policy edits all go through the busting endpoints.

---

## Summary table

| # | Key | TTL | Loader (source) | Busted by |
|---|---|---|---|---|
| 1 | `perms:{tenant}:{emp}` | 300s | Postgres: Employee + UserAppRole→AppRole→RolePermission + UserPermissionExtra | role/perm/nav edits, role assign, confirm, temp-pw, preboarding cron, central role change, logout |
| 2 | `employee-me:{tenant}:{emp}` | 300s | Postgres: Employee (+Dept/Designation/Role) | logout, central suspend/reactivate — **NOT profile edits** |
| 3 | `notif-unread:{tenant}:{emp}` | **15s** | Postgres: `notification.count(isRead:false)` | mark-read, mark-all, logout — **NOT notification create** |
| 4 | `session-valid:{authUserId}` | 60s | HTTP: central `/api/verify-token` (fail-open) | logout |
| 5 | `central-member:{tenant}:{authUserId}` | 120s | HTTP: central `/api/internal/members/lookup` (fail-open) | logout |
| 6 | `leave-policy-active:{tenant}` | 300s | Postgres: `leavePolicy.findMany(status:Active)` | policy create/update/delete/approve/extract |

All six share the same LRU→Redis→loader read path, the same fail-open behavior,
and the same exact-key (no wildcard) pub/sub invalidation. Without Redis they all
degrade to per-process LRU with identical correctness.
