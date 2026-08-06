# @quikit/realtime-gateway

The QuikChat **realtime gateway** — a Phase 0 port of the standalone gateway into the QuikIT
monorepo. It is a plain Node service (Socket.IO + Redis), **not** a Next.js app.

It is **write-free**: it never writes a domain row. It authenticates a short-lived handshake
token, joins each socket to org-scoped rooms, and provides:

- **Fan-out** — consumes the `quikchat:fanout` Redis channel (the app's persist-then-publish
  seam) and relays events to `org:{orgId}:channel:{channelId}` / `org:{orgId}:user:{userId}`
  rooms. The room is always derived from the event's `orgId` — a payload can never cross tenants.
- **Presence** — Redis-only online/offline + heartbeat, broadcast to shared-channel members.
- **Calling signaling** — membership-gated WebRTC relay (`call:*`), with a multi-instance-safe
  Redis-backed ringing timeout.

Read-only chat facts (membership, channel ids, call participants) are sourced from the central
`@quikit/database` client.

## Commands

```bash
npm run dev         # tsx watch; auto-loads ./.env if present (fresh clone boots without one)
npm run build       # esbuild bundle → dist/index.js (workspace @quikit/* inlined, npm deps external)
npm run start       # node dist/index.js (production; no tsx at runtime)
npm run test        # vitest run — 62 tests, DB-free (mocks @quikit/database)
npm run typecheck   # tsc --noEmit
```

## Environment

See [`.env.example`](./.env.example) for the full contract (plan §5). Required: `REALTIME_TOKEN_SECRET`
(the process exits on boot without it). Note `REDIS_URL` defaults to `redis://localhost:6380`
(not the usual 6379).

## Wire contract (do not rename)

This service is **chat-only** and the wire protocol is **byte-compatible** with the app:
it subscribes to the `quikchat:fanout` channel and speaks the chat-shaped event vocabulary
(`message`, `message_update`, `reaction`, `channel_created`, `system`, `read`, `delivered`,
`notification`, `presence`, `typing`, `call:*`). `FANOUT_CHANNEL` and this vocabulary are the
frozen wire identifiers — **do not rename them.** Generalization (v2 envelope / namespacing /
HTTP publish) is deferred to Phase 3; `src/fanout-contract.ts` is a deliberate duplicate of the
app's `publish.ts`, flagged as tech-debt to unify then.

(Service-identity strings — the `/health` `service` field, the Prometheus `service` label, the
boot log — are `realtime-gateway`, intentionally separate from the `quikchat:` wire strings.)

## Deploy prerequisites

The `Dockerfile` builds a `node:20-alpine` image (multi-stage: `turbo prune` → npm ci + prisma
generate + esbuild → non-root runner). Before that image will **boot**, the Prisma query engine
must have an Alpine (musl) binary. That requires the generator block in
`packages/database/prisma/schema.prisma` to carry:

```prisma
binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
```

> **Owned OUTSIDE this workspace.** `packages/database` is shared and is not edited here — this is
> a cross-cutting deploy prerequisite the integration owner settles in Phase 1 config. See the
> matching note in the [`Dockerfile`](./Dockerfile) header.
