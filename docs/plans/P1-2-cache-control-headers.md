---
id: P1-2
title: Cache-Control on hot per-user read endpoints
wave: 2
priority: P1
type: change-note
status: Draft
created: 2026-04-17
targets: [quikit, quikscale, admin]
---

# P1-2 — Cache-Control on hot per-user read endpoints

> **Change note (not a full plan).** Adds `Cache-Control: private, max-age=30, stale-while-revalidate=60` to four endpoints that the frontends hit on nearly every page load. The risk surface is small (all return data the user is already authorised to see) and the latency win is real: under a sustained 1K-CCU workload these four endpoints carry most of the DB read volume.

---

## Why

The audit (`docs/architecture/10k-users-iaas-rollout.md` §4) flagged:

- `/api/apps/launcher` (quikit) — called on every visit to `/apps`
- `/api/apps/switcher` (quikscale + admin) — called on dashboard mount
- `/api/org/memberships` (quikit) — called on dashboard mount

At 1 000 CCU each of these is ~50-200 req/s on Postgres. None of them has a `Cache-Control` header today, so browsers don't cache, and the Vercel edge won't either. Each request hits the DB.

## What

Add headers to the four routes:

| File | Header |
|---|---|
| [apps/quikit/app/api/apps/launcher/route.ts](../../apps/quikit/app/api/apps/launcher/route.ts) | `Cache-Control: private, max-age=30, stale-while-revalidate=60` |
| [apps/quikscale/app/api/apps/switcher/route.ts](../../apps/quikscale/app/api/apps/switcher/route.ts) | same |
| [apps/admin/app/api/apps/switcher/route.ts](../../apps/admin/app/api/apps/switcher/route.ts) | same |
| [apps/quikit/app/api/org/memberships/route.ts](../../apps/quikit/app/api/org/memberships/route.ts) | same |

**Directives explained:**
- `private` — never cached by shared caches / the Vercel edge. This response contains per-user data; we don't want a CDN serving Alice's memberships to Bob. `private` ensures only the user's own browser cache holds it.
- `max-age=30` — browser treats the response as fresh for 30 seconds. Zero network round-trip for re-fetches inside that window.
- `stale-while-revalidate=60` — for the next 60 seconds after the freshness window, the browser may serve the stale response while fetching a new one in the background. Gives a snappy perceived UX while still keeping data ~90 seconds fresh at worst.

## Risks

| Risk | Mitigation |
|---|---|
| A user loses app access mid-cache; their launcher still shows the app for up to 90 s | Acceptable — clicking Launch hits server-side auth and gets a 403 regardless. No data leak, just stale visibility. |
| Confusion if an admin adds a new app and the affected user doesn't see it for 90 s | Inform support; the Add-app flow already documents "allow up to a minute for propagation." |
| Browser caches a stale membership list while the user is removed from a tenant | Same as above — every protected route re-checks tenant on the server; the cached list is cosmetic. |

## Verification

- Deploy to dev; visit `/apps` twice in quick succession with DevTools → Network open. Second request should be `(disk cache)` or `(memory cache)`.
- `curl -D-` the endpoint and confirm `Cache-Control` appears in the response.
- No regression test needed — this is a header addition with zero branching logic.

## Rollback

Revert the commit. Instant.
