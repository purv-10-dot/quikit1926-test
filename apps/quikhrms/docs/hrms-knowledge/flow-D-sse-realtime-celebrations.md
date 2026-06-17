# Flow D — SSE Realtime Pipeline + Celebrations / Dashboard Caching

Traced from actual code in `apps/quikhrms`. Two distinct Redis usages live here and the
reviewer's "anniversary disappears after a TTL" observation maps to the **second** one,
not the SSE bus.

| Mechanism | Redis role | What's stored | TTL | Source of truth |
|---|---|---|---|---|
| SSE realtime (`realtime:{orgId}`) | **Message bus (PUBLISH/SUBSCRIBE)** | Nothing — fire-and-forget | n/a | Postgres (re-fetched after event) |
| Celebrations / birthdays / anniversaries / dashboard batch | **Cache (SET with TTL)** | Computed JSON list | 300s (15s for notif count) | Postgres (loader on miss) |

---

## PART 1 — SSE Realtime Pipeline (Redis = transient message bus, nothing stored)

### Trigger / data source
A backend write (asset change, leave approval, ticket update, payroll/bulk-import job
progress, any notification) calls a `publish*` helper. Redis is used purely as a
fan-out PUBLISH bus — **no key is written, no TTL, nothing persists**. The data the
screen ultimately renders is re-fetched from Postgres via React Query invalidation.

### Step-by-step flow

1. **Publish.** A route/service calls e.g. `publishNotification(...)` →
   `publishEvent(...)` → `pub.publish("realtime:{orgId}", JSON.stringify(event))`.
   `src/lib/services/realtime.ts:39-43` (publisher), helpers `:47-111`.
   - Publisher is a lazily-created singleton `ioredis` client; in non-prod it's stashed
     on `globalThis.realtimePub` (`:21-36`). Throws if `REDIS_URL` unset (`:27`).
   - **This is a Redis PUBLISH only. Nothing is stored. No TTL.** (`:42`)

2. **SSE route subscribes.** `GET /api/v1/hrms/realtime/stream`
   (`src/app/api/v1/hrms/realtime/stream/route.ts`). `runtime = "nodejs"`,
   `dynamic = "force-dynamic"` (`:14-15`).
   - Resolves identity from the session cookie via `resolveIdentity(req)` (`:19-30`);
     dev no-login flow falls back to `x-tenant-id` / `orgId` query param (`:24-28`).
     401 if neither (`:33-39`).
   - Opens a `ReadableStream`; on `start` it emits `event: connected` (`:48`), then
     `createSubscriber(orgId, onMessage)` opens a **dedicated** `ioredis` connection
     and `SUBSCRIBE`s `realtime:{orgId}` (`realtime.ts:115-139`, called at
     `route.ts:60`).

3. **Per-employee filtering.** On each message, if `event.targetEmployeeIds` is
   non-empty and the connected `employeeId` isn't in it, the event is dropped
   (`route.ts:62-64`). Empty list = broadcast to whole tenant.

4. **Stream to browser.** Matching events are written as
   `event: {type}\ndata: {JSON payload}\n\n` (`route.ts:67-69`).

5. **30s heartbeat.** `setInterval(... , 30_000)` emits `event: heartbeat` to keep the
   connection alive (`route.ts:51-57`). Cleared on client disconnect / abort
   (`:54-55`, `:72-73`, `:78-82`).

6. **Cleanup.** `req.signal` `abort` and stream `cancel()` both call
   `subscriberRef.unsubscribe()` → `sub.unsubscribe()` + `sub.disconnect()`
   (`route.ts:78-86`, `realtime.ts:133-138`).

7. **Client hook.** `useRealtime` (`src/lib/hooks/use-realtime.ts`) opens an
   `EventSource` to the stream (`:41`), and on each typed event **invalidates a React
   Query key** then dispatches to registered handlers:
   - `notification` → invalidate `["notifications"]` (`:50-54`)
   - `payroll_progress` → invalidate `["payroll"]` (`:56-60`)
   - `bulk_import_progress` → invalidate `["employees","bulk-import"]` (`:62-66`)
   - `ticket_update` → invalidate `["tickets"]` (`:68-72`)
   - `asset_update` → invalidate `["assets"]` + `["asset", id]` (`:74-79`)
   - `onerror` → close + exponential-backoff reconnect 1s→2s→…→max 30s (`:81-89`)

8. **Provider wiring.** `RealtimeProvider` (`src/components/hrms/realtime-provider.tsx`)
   wraps `useRealtime` in context; `enabled` only when session is `authenticated`
   (or dev ids present) (`:41-44`). Mounted app-wide in
   `src/components/providers.tsx:29`.

### Which screens mount it / what they do on an event

- **`RealtimeToastListener`** (`src/components/hrms/realtime-toast.tsx`, mounted in
  `src/app/(dashboard)/hrms/layout.tsx:25`) — subscribes to `notification` and pops a
  toast (`success`/`warning`/`error`/`info`) (`:16-34`). No DB call itself.
- **`Sidebar`** (`src/components/hrms/layout/sidebar.tsx:305-320`) — on `notification`,
  invalidates `["notifications","unread-count"]`, which refetches
  `/api/v1/hrms/notifications/unread-count` from Postgres. The badge is otherwise
  `staleTime: 60_000` with **no polling** (`:308-313`).
- **`ConnectionStatus`** (`src/components/hrms/connection-status.tsx:12`) — only reads
  `status`, no data.

### What the screen shows + how it updates
SSE is a **push-to-invalidate** model. The event payload itself is *not* rendered as
data (except the toast text); it just tells React Query "this cache is stale," which
triggers a **refetch from Postgres**. So: SSE push → `invalidateQueries` → component
refetches the real list from the DB.

### On event
The hook re-queries Postgres (via the invalidated query's `queryFn`). Redis stored
nothing to expire — the event is a one-shot signal.

### Degraded (no Redis)
- `getPublisher()` / `createSubscriber()` **throw** if `REDIS_URL` is unset
  (`realtime.ts:27,117`). Publishers in services are wrapped in `.catch(() => {})`
  (e.g. `payroll-notifications.ts:57`), so a write still succeeds; the realtime nudge
  is simply lost. The SSE route would 500 on connect; the client `onerror` keeps
  retrying.
- **Screens still work without SSE**: every consumer fetches via React Query with a
  `staleTime`, so data loads on mount/navigation/window-focus regardless. Only the
  *live push* (instant toast, instant badge bump) is lost — refresh/navigation
  recovers it.

---

## PART 2 — Publishers (every call site)

| Helper | Call site | Trigger |
|---|---|---|
| `publishAssetUpdate` | `assets/route.ts:144,159` | Asset created (bulk + single) |
| `publishAssetUpdate` | `assets/[id]/route.ts:54,74` | Asset updated / deleted |
| `publishAssetUpdate` | `assets/[id]/scrap/route.ts:75` | Asset scrapped |
| `publishAssetUpdate` | `assets/[id]/return/route.ts:99` | Asset returned |
| `publishAssetUpdate` | `assets/[id]/assign/route.ts:90` | Asset assigned |
| `publishNotification` | `delegations/route.ts:133` | Delegation created → notify recipients |
| `publishNotification` | `leaves/requests/[id]/approve/route.ts:100` | Leave approved → notify employee |
| `publishNotification` | `recruit/applications/[id]/route.ts:427` | Application stage change → notify |
| `publishNotification` | `lib/services/payroll-notifications.ts:52` | Payroll notification (e.g. payslip ready) |
| `publishNotification` | `lib/services/task-notifications.ts:48` | Task assignment / update |
| `publishNotification` + `publishTicketUpdate` | `lib/services/ticket-notifications.ts:93,99` | Helpdesk ticket status/assignment change |
| `publishPayrollProgress` | `worker/processors/payroll-run.ts:37,75,95` | BullMQ payroll worker: start / per-batch progress / failed |
| `publishBulkImportProgress` | `worker/processors/bulk-employee-import.ts:47` | BullMQ bulk-import worker: per-chunk progress |

All publisher calls are fire-and-forget (`void` or `.catch(() => {})`).

---

## PART 3 — Celebrations / Anniversaries / Birthdays — **YES, Redis-cached with a TTL**

### This is what the reviewer saw. His assumption is CORRECT for this data.

### Trigger / data source
The home widgets and the Celebrations calendar fetch employee birthday/joining dates.
The API computes "upcoming" lists and **caches the result in Redis with a 300s (5-min)
TTL** via the shared layered cache.

### The cache primitive
`getCached(key, ttlSec, loader)` (`src/lib/services/cache.ts:12-14`) →
`getOrSet` in `packages/auth/cache.ts:147-175`. Layered:
1. **In-memory LRU** (per-process Map, `cache.ts:80`) — first stop (`:158-159`).
2. **Shared Redis** (`@quikit/redis`, `cacheGet/cacheSet`) — second stop (`:162-167`),
   backfills the local layer on hit.
3. **Loader** runs only on full miss; result written to *both* layers, Redis write is
   fire-and-forget (`:170-174`). `cacheSet` uses Redis `SET key value EX ttl`, so the
   key **physically expires and disappears from Redis after the TTL** — this is exactly
   the "sits with a TTL then is removed" behaviour seen in RedisInsight.
- **Fail-open**: any Redis error returns the loader's fresh value (`redisGet/redisSet`
  swallow errors, `:111-135`).

### Cache keys + TTLs (all in HRMS)

| Endpoint | Key | TTL | File:line |
|---|---|---|---|
| `GET /employees/celebrations` | `celebrations:{orgId}` | 300s | `employees/celebrations/route.ts:14` |
| `GET /employees/birthdays` | `birthdays:{orgId}` | 300s | `employees/birthdays/route.ts:13` |
| `GET /employees/anniversaries` | `anniversaries:{orgId}` | 300s | `employees/anniversaries/route.ts:14` |
| `GET /dashboard/batch` (birthdays slice) | `birthdays:{orgId}` | 300s | `dashboard/batch/route.ts:40` |
| `GET /dashboard/batch` (anniversaries slice) | `anniversaries:{orgId}` | 300s | `dashboard/batch/route.ts:57` |
| `GET /dashboard/batch` (profile) | `employee-me:{orgId}:{userId}` | 300s | `dashboard/batch/route.ts:21` |
| `GET /dashboard/batch` (notif count) | `notif-unread:{orgId}:{userId}` | 15s | `dashboard/batch/route.ts:35` |

The loader (e.g. `anniversaries/route.ts:16-42`) runs the Postgres
`prisma.employee.findMany({ where: { orgId, deletedAt: null, status: "Active" }, ... })`,
computes `daysUntil` / `years`, filters to the current month, sorts, slices.

### What the screen shows + how it updates
- **Home page** (`src/app/(dashboard)/hrms/page.tsx`) mounts `BirthdaysWidget` /
  `AnniversariesWidget` (`dashboard-widgets.tsx:467-544`). Each is a React Query with
  `queryKey ["home","birthdays"]` / `["home","anniversaries"]`, `staleTime: 5*60_000`
  (`:469-473`, `:511-515`). **No SSE listener, no polling.**
- **Celebrations calendar** (`src/app/(dashboard)/hrms/celebrations/page.tsx:44-47`) —
  React Query `["celebrations"]`, **no `staleTime`** (defaults to 0 → refetches on
  mount/focus), hits `/employees/celebrations`.

So the client has its own 5-min React-Query stale window *and* the server has a 5-min
Redis TTL — two independent layers.

### On TTL expiry — DOES the screen re-query the DB? **Yes, on the next request.**
The Redis key is removed at 300s, but **nothing pushes that to the screen**. The widget
does not subscribe to SSE and does not poll. The chain is purely **pull**:

1. Redis key `anniversaries:{orgId}` expires/disappears at TTL → next API hit is a
   cache **miss**.
2. A miss only happens when the client actually re-requests — i.e. on **page reload,
   route re-navigation, window-refocus, or React-Query `staleTime` lapse** (5 min).
3. On that next request, `getOrSet` finds both layers empty → **re-runs the Postgres
   loader**, recomputes the list, and re-populates Redis with a fresh 300s TTL.

**Brutally honest correction to the reviewer's mental model:** when the Redis key
"disappears," the screen does **not** instantly react, re-call the DB, or blank out.
The on-screen widget keeps showing its last fetched value until the *browser* decides to
refetch (reload/focus/5-min stale). The DB re-query happens server-side on that next
request, not at the moment the TTL fires. The TTL expiry he watched in RedisInsight and
any on-screen change are **decoupled** — there is no expiry-driven push.

Also note: these three celebration caches are **never explicitly invalidated**. A grep
for `invalidateKeys` shows busts only for `permissions`, `notif-unread`, `session-valid`,
central-sync, and leave-policy keys — **not** `celebrations:` / `birthdays:` /
`anniversaries:`. So editing an employee's DOB/joining date can stay stale for up to
5 minutes (TTL is the only eviction). That's an accepted staleness window, not a bug
per the cache-strategy comment (`packages/auth/cache.ts:10-13`).

### Degraded (no Redis)
- `getOrSet` still works: Layer 1 in-memory LRU serves within a process; on full miss
  it runs the Postgres loader and returns fresh data. `isRedisCacheEnabled()` is just
  `Boolean(getRedis())` (`cache.ts:189`). So **celebrations/dashboard render fine with
  no Redis** — they degrade to per-process in-memory caching + direct Postgres reads.
- Cross-process invalidation (`quikit:cache-invalidate` channel) silently no-ops without
  Redis (`cache.ts:39-65`), but since these keys are never invalidated anyway, it's moot.

---

## PART 4 — Home Dashboard Batch (`GET /api/v1/hrms/dashboard/batch`)

`src/app/api/v1/hrms/dashboard/batch/route.ts` — one request replacing 6+ calls. Runs
6 promises in parallel (`:19-108`):

1. **Profile** `employee-me:{orgId}:{userId}` — cached 300s (`:21-32`).
2. **Unread notif count** `notif-unread:{orgId}:{userId}` — cached **15s** (`:35-37`).
3. **Birthdays** `birthdays:{orgId}` — cached 300s (`:40-54`).
4. **Anniversaries** `anniversaries:{orgId}` — cached 300s (`:57-72`).
5. **Holidays** — **NOT cached**; direct `prisma.companyHoliday.findMany` each call
   (`:75-89`).
6. **Attendance today** — **NOT cached** ("real-time", `:91-107`), direct Postgres read.

Client hook `useDashboardBatch` (`src/lib/hooks/use-dashboard-batch.ts:53-62`):
`queryKey ["dashboard","batch"]`, `staleTime: 30_000`, `refetchOnWindowFocus: true`.
Same pull model — refetches on focus / 30s stale; no SSE, no polling. On a Redis miss
after TTL, the cached slices re-run their Postgres loaders.

---

## Summary for the reviewer

- **SSE pipeline:** Redis is a pure **PUBLISH/SUBSCRIBE message bus** — nothing stored,
  no TTL. Events trigger React-Query invalidation → screens **refetch from Postgres**.
  Heartbeat every 30s. Without Redis the live push is lost but screens still load via
  normal fetch.
- **Celebrations / birthdays / anniversaries / dashboard:** these ARE **Redis-cached
  with a 5-min TTL** (`getCached`/`getOrSet` → `SET … EX 300`). The "data appears, sits
  with a TTL, then is removed" is real and is this cache. **But** TTL expiry does **not**
  push anything to the screen and does **not** by itself re-call the DB — the re-query
  happens on the *next* client request (reload/focus/5-min React-Query stale). The
  widgets have no SSE subscription and no polling. The Redis TTL and any visible refresh
  are decoupled. These keys are also never explicitly invalidated, so they're stale up
  to 5 min after an employee edit, by design.
