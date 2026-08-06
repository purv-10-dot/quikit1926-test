# Shared Realtime (Socket) Service for QuikIT — Architecture & Implementation Plan

> **Status:** implementation plan (approved direction, not yet built). The "should we build it" question is answered — **yes, one shared, domain-agnostic gateway**. This document is the concrete "how," grounded in QuikChat's portable source and QuikIT's actual conventions (npm workspaces + Turbo, raw-TS packages, NextAuth JWT auth, React Query polling today).

## Context

QuikIT is 15 serverless Vercel Next.js apps that **cannot host long-lived WebSockets** (serverless functions are request-scoped and terminate). Live UI today is React Query `refetchInterval` polling (~30–60s). A previous per-app SSE/Redis-pub-sub realtime layer was deliberately removed and survives only as `503` tombstones + no-op `publish*` stubs.

We will replace polling with **one shared Socket.IO gateway** — a separate long-running process that apps talk to only through a **Redis envelope bus + a short-lived JWT handshake**. The gateway never touches any app DB and never writes domain rows. The coupling mistake in QuikChat's gateway (which reads `qcChannelMember`/`qcCall` on the socket hot path) is designed out here by carrying room grants in the token.

**Why one shared service (not per-app):**
1. Serverless can't hold sockets, so realtime *must* be a separate process regardless — the only real choice is one shared gateway vs. N per-app copies, and N stateful copies means N hosting bills, N presence stores, and duplicated auth.
2. Per-app realtime was already tried and ripped out; the leftover event envelopes across QuikChat (`FanoutEvent`) and QuikHRMS (`RealtimeEvent`) are nearly identical — independent convergence on one org-scoped envelope is strong evidence a single shared abstraction fits.

**Reuse, don't reinvent:** QuikChat already has working, portable versions of every piece — `rooms.ts`, `presence.ts`, `token.ts`, `publish.ts`, the gateway wiring, and a browser client. We port the domain-agnostic parts and drop the QuikChat-specific DB reads.

## Target topology

```
Apps (serverless, Vercel)              Shared infra            Long-running host
──────────────────────────            ─────────────           ─────────────────
quikchat  → persist → publish ─┐
quiktrack → persist → publish ─┤→   Redis pub/sub      →   realtime gateway
quikcrm   → persist → publish ─┤    "quikit:fanout"        - Socket.IO server
quikhrms  → persist → publish ─┘    channel (envelope)      - verifies handshake JWT
                                                            - joins org+rooms from claims
     each app owns its own DB;                              - fans out to org-scoped rooms
     gateway NEVER reads a payload's DB,                    - presence (Redis SET + TTL)
     NEVER writes a domain row                        →   Browsers (in org rooms only)
```

## Auth model (decision)

Use a **dedicated short-lived socket ticket**, not the raw NextAuth cookie (cross-origin httpOnly cookies to a separate gateway host are painful). Each app exposes `GET /api/realtime/token` (behind its existing `withAuth`/`withTenantAuth`) that mints a **60s HS256 JWT** with claims `{ userId, orgId, rooms: string[] }`, signed with a new shared secret **`REALTIME_TOKEN_SECRET`**. This mirrors QuikChat's `app/src/app/api/realtime/token/route.ts` exactly and matches the existing hand-signed-token precedent (`apps/auth/app/api/post-login/route.ts` uses `jose` HS256 with `INTERNAL_SECRET`). The **app** resolves room grants (it has DB access in the serverless route); the **gateway** only verifies the signature and joins the named rooms — so the gateway stays DB-free.

## Component 1 — `@quikit/realtime` shared package (imported by apps; serverless-safe)

New package `packages/realtime/`, mirroring `packages/redis/` conventions exactly: `private: true`, `version "0.0.1"`, `main`/`types`/`exports` → raw `./index.ts` (no build step), `tsconfig.json` extends `../../tsconfig.base.json`, cross-deps via `"*"`. Deps: `ioredis` (publisher only), `jsonwebtoken` + `@types/jsonwebtoken`, `socket.io-client`. **No `@quikit/database`, no `@quikit/auth`** (keep it light; auth is resolved in the app route, not here).

Files (port from QuikChat, generalized):

- **`envelope.ts`** — the generalized fan-out contract (replaces QuikChat's channel-specific `FanoutEvent`):
  ```ts
  export const FANOUT_CHANNEL = "quikit:fanout";
  export interface FanoutEnvelope {
    orgId: string;
    appId: string;            // "quikcrm" | "quikhrms" | "quikchat" | ...  (namespaces events)
    event: string;            // "notification" | "lead.updated" | "payroll.progress" | ...
    rooms: string[];          // fully-qualified room names to deliver to (built from orgId)
    userIds?: string[];       // convenience: also deliver to org:{orgId}:user:{id}
    payload: unknown;
  }
  ```
- **`publish.ts`** — port QuikChat `packages/shared/src/publish.ts` almost verbatim: always fire an in-process `EventEmitter` (hermetic dev/test), and **additionally** lazy-`import("ioredis")` + `PUBLISH` to `quikit:fanout` only when `REDIS_URL` is set; swallow Redis errors (best-effort, reconciled by client refetch). Keep `__resetPublishedForTest`/`__getPublishedForTest`.
- **`rooms.ts`** — port verbatim + add a topic-room builder:
  ```ts
  export const userRoom  = (orgId, userId) => `org:${orgId}:user:${userId}`;
  export const topicRoom = (orgId, appId, topic) => `org:${orgId}:${appId}:${topic}`;
  ```
  The `org:{orgId}:` prefix is the tenant-isolation invariant (cross-tenant delivery is structurally impossible). This aligns with QuikCRM's existing `tenantLeadChannel(orgId) = "quikcrm:leads:${orgId}"` naming in `apps/quikcrm/lib/services/leads/realtime.ts`.
- **`token.ts`** — `mintRealtimeToken({ userId, orgId, rooms }, secret)` (sign, 60s) + `verifyRealtimeToken(token, secret)` returning `{ userId, orgId, rooms }`. Port QuikChat `realtime/src/token.ts`, extended with the `rooms` claim.
- **`client.ts`** — port QuikChat `app/src/lib/realtime-client.ts`: `createRealtimeClient({ url, getToken })` using `io(url, { auth: cb => getToken().then(t => cb({token:t})) })` (auto re-mints the ticket on every reconnect), heartbeat interval, `join/leave/on/off/disconnect`. Add a thin React hook `useRealtime(appId, onEvent)` for app providers.
- **`index.ts`** — re-export the above **and** provide typed convenience publishers that build envelopes, so the existing app call-sites become real without touching them (see Component 3):
  ```ts
  export function publishNotification(orgId, userIds, data, appId) { /* build envelope → publishFanout */ }
  export function publishToTopic(orgId, appId, topic, event, payload) { /* ... */ }
  ```

> **Governance:** every app `CLAUDE.md` forbids creating/modifying `packages/*` without integration-owner approval. Creating `@quikit/realtime` is explicitly an **integration-team action** — flag for sign-off before coding.

## Component 2 — the gateway service (new long-running process)

New top-level workspace `services/realtime-gateway/` (add `"services/*"` to the root `package.json` `workspaces` array — keeps it distinct from Next apps so Turbo's Next assumptions don't apply). Port QuikChat's `realtime/` **minus all DB coupling**. Deps kept minimal: `socket.io`, `@socket.io/redis-adapter`, `ioredis`, `jsonwebtoken`, dev `tsx` + `dotenv-cli`. Run via `tsx` (no compile), same as QuikChat. Include a `Dockerfile` (port QuikChat's, but for **npm** workspaces not pnpm — `npm ci` + `npm run --workspace`).

Files:
- **`src/index.ts`** — port verbatim: read `REALTIME_PORT` (3012), `REDIS_URL`, `REALTIME_TOKEN_SECRET` (hard-exit if missing), `REALTIME_ALLOWED_ORIGINS` (CSV of all app origins). Create the **four ioredis connections** (`pubClient`+`subClient` for `@socket.io/redis-adapter`, `fanoutSub` for `SUBSCRIBE quikit:fanout`, `presenceClient`). Track `redisReady` for `/health`. Graceful drain on SIGTERM/SIGINT. (Gateway makes its **own** ioredis connections — it cannot reuse `@quikit/redis`'s single cache singleton because a subscriber connection is in subscriber mode.)
- **`src/gateway.ts`** — port `createGateway(opts)` with these changes:
  - Handshake `io.use`: `verifyRealtimeToken(token, secret)` → pin `socket.data = { userId, orgId, rooms }`.
  - Connection: auto-join `userRoom(orgId, userId)` and every room in `socket.data.rooms` (from the token). **Delete** the `listChannelIdsForMember` / `listMemberUserIdsForChannels` DB reads.
  - `join(room, ack)`: authorize by **"does `room` start with `org:{socket.orgId}:` AND (is it in `socket.data.rooms` OR is it a non-membership topic room)?"** — no DB, no `assertMembership`. Simplest safe rule: allow any room prefixed with the socket's own `org:{orgId}:` (tenant isolation already guarantees safety); use the `rooms` claim allowlist only for membership-gated rooms (e.g. QuikChat private channels).
  - `dispatchFanout(io, env)`: generic — deliver `env.payload` under event name `env.event` to every room in `env.rooms` plus each `userRoom(orgId, uid)` for `env.userIds`. **Delete** the hardcoded `channel_created`/`notification`/`system` special-casing (keep an optional `join-room` control event for the QuikChat "add me to a new channel live" case).
  - Keep verbatim: per-socket inbound rate limiter, `typing` (room-membership-gated), presence wiring, `heartbeat`.
- **`src/presence.ts`, `src/rooms.ts`, `src/token.ts`** — import from `@quikit/realtime` (or vendor copies); all already domain-agnostic.
- **WebRTC calling stays QuikChat-only:** do **not** port `calling.ts` into the shared core (it reads `prisma.qcCall`). Register it as an **app-scoped plugin** loaded only for `appId === "quikchat"`, injected with its own prisma client + `userRoom` + a per-instance `ringingTimeouts` map. For the first cut, QuikChat can keep its own gateway for calling and use the shared gateway only for message/notification fan-out.

**Hosting:** a persistent Node host (Render / Railway / Fly.io / small VM) — **not** Vercel. Recommend self-hosted container (reuses the existing Redis + the ported Dockerfile). This is the one genuine build-vs-buy fork (self-hosted vs Pusher/Ably).

## Component 3 — per-app integration (repeatable pattern; pilot one app first)

For each adopting app (representative paths from QuikCRM/QuikHRMS):

1. **Token route** — add `app/api/realtime/token/route.ts` wrapped in the app's existing guard (`withTenantAuth` in quikcrm, `withAuth` in quikhrms), resolving the user's rooms and calling `mintRealtimeToken({ userId, orgId, rooms }, process.env.REALTIME_TOKEN_SECRET)`. Returns `{ token, expiresIn }`.
2. **Make the stubs real** — rewrite the app-local no-op files to delegate to `@quikit/realtime` (app-level edit, allowed):
   - `apps/quikhrms/lib/services/realtime.ts` — `publishNotification(orgId, employeeIds, data)` → build envelope `{ appId:"quikhrms", event:"notification", userIds:employeeIds, payload:data }` → `publishFanout`. Live call-sites already exist (fire-and-forget after DB write): `lib/services/task-notifications.ts:48`, `lib/services/payroll-notifications.ts:38`, `app/api/v1/hrms/leaves/requests/[id]/approve/route.ts:124/204`, `app/api/v1/hrms/delegations/route.ts:161`, `recruit/applications/[id]/route.ts:480`.
   - `apps/quikcrm/lib/services/leads/realtime.ts` — `publishLeadEvent(orgId, event)` → topic room `org:{orgId}:quikcrm:leads`. Live call-sites: `app/api/leads/route.ts`, `app/api/leads/[id]/route.ts`, `[id]/restore`, `[id]/permanent`, `lib/services/leads/transition-service.ts`.
   No edits to call-sites — they keep the same fire-and-forget `.catch(() => {})` shape.
3. **Client subscription** — add a socket client next to the existing `QueryClient` in `apps/<app>/components/providers.tsx`. On a socket event, call `queryClient.invalidateQueries({ queryKey: [...] })` against the **existing** keys — e.g. quikcrm `["notifications","unread-count"]` (`hooks/use-notifications.ts`), quikfinance `["portal-notifications", portal]`, the lead kanban keys. Keep `refetchInterval` as the **fallback** (drop it to a slow 5-min safety poll, or gate it on socket-disconnected). Retire the `/stream` 503 route + `EventSource` client once sockets are verified.

> **Governance:** `providers.tsx` provider **order is locked** in every app CLAUDE.md (`SessionProvider → QueryClientProvider → ThemeProvider`). Adding a socket provider *inside* `QueryClientProvider` is fine but needs architect sign-off; do not reorder the existing three.

## Env & Turbo config

- New secret **`REALTIME_TOKEN_SECRET`** (shared by all apps + the gateway) and public **`NEXT_PUBLIC_REALTIME_URL`** (gateway origin) — add both to `turbo.json` `tasks.build.env`. `REDIS_URL`, `NEXTAUTH_SECRET`, `INTERNAL_SECRET` are already in the allowlist.
- Gateway env: `REALTIME_PORT`, `REDIS_URL`, `REALTIME_TOKEN_SECRET`, `REALTIME_ALLOWED_ORIGINS` (all app prod origins, CSV).
- The gateway uses the Turbo `dev` task (`persistent: true, cache: false`).

## Phased rollout (low risk, incremental)

1. **Package** — land `@quikit/realtime` (envelope + publish + rooms + token + client) with unit tests; nothing wired yet.
2. **Gateway** — stand up `services/realtime-gateway` on a persistent host; verify `/health` + a manual publish→receive smoke test.
3. **Pilot: QuikCRM notifications** — the cleanest first cut (per-user room + one query-key invalidation; the client hook already expects realtime). Add the token route, make `publishNotification`/CRM notif publishing real, wire the client to invalidate `["notifications","unread-count"]`. Keep polling as fallback.
4. **Second use-case: QuikCRM lead kanban** (topic room) and **QuikHRMS notifications** (per-user) — proves both room shapes.
5. **QuikChat onto the shared gateway** for fan-out; calling stays an app-scoped plugin (or QuikChat keeps its own gateway for calls only).
6. Retire `/stream` tombstones + `refetchInterval` polling app-by-app as each cuts over.

## Verification (end-to-end)

- **Package unit tests** (Vitest, matches repo): `publishFanout` fires the in-process emitter with no `REDIS_URL`; sets `userIds`→`userRoom` correctly; `mintRealtimeToken`/`verifyRealtimeToken` round-trip; a tampered/expired token throws.
- **Gateway smoke**: `GET /health` → 200 with Redis up, 503 with Redis down. Script two `socket.io-client` connections with tickets for org A and org B; `PUBLISH quikit:fanout` an envelope for org A; assert **only** A's socket receives it (room built from `orgId`, never payload). Assert a connection with no/expired/invalid ticket is refused, and `join` to a room outside the socket's `org:{orgId}:` prefix is rejected.
- **No-DB-coupling regression**: grep `services/realtime-gateway/src` for `@quikit/database`, `prisma.`, `assertMembership` → must be **zero** in the generic core (calling plugin excepted).
- **Pilot E2E (QuikCRM)**: two browser tabs as the same org user; create a notification via the normal API in tab 1; assert the bell badge updates live in tab 2 **without** waiting for the poll interval. Kill the gateway; assert the UI degrades cleanly to polling with no console errors (matches `@quikit/redis`'s fail-open philosophy).

## Open decisions

- **Build vs buy**: self-hosted Socket.IO container (recommended — reuses Redis + ported Dockerfile) vs managed Pusher/Ably. Only real fork.
- **Hosting target** for the self-hosted gateway (Render / Railway / Fly / VM).
- **Governance sign-off**: new `packages/realtime` + editing locked `providers.tsx` both require integration-owner/architect approval per app CLAUDE.md — confirm before implementation starts.
