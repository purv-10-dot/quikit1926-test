---
id: P0-1
title: Postgres connection pooling + directUrl split
wave: 1
priority: P0
status: Draft
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [quikit, quikscale, admin]
depends_on: []
unblocks: [P0-3, IAS-1]
---

# P0-1 — Postgres connection pooling + `directUrl` split

> **TL;DR** — `DATABASE_URL` is raw Postgres with no connection cap. On Vercel, each serverless lambda spawns its own pool; 100 concurrent users ≈ 500 Postgres connections, which exceeds most managed-plan limits. We route runtime through a PgBouncer/pooler URL and add a `directUrl` for migrations. Single Prisma code change, two env vars, a schema tweak, and one migration audit. ~4 hours of implementation, ~1 day of burn-in.

---

## 1. Context

### 1.1 Evidence

The audit (`docs/architecture/10k-users-iaas-rollout.md` §2) identified this as the **single most load-bearing P0 fix**. Citation trail:

- `packages/database/index.ts:62-75` — `PrismaClient` is constructed with only `url: process.env.DATABASE_URL`. No `connection_limit` query parameter is appended anywhere. The comment on lines 73-75 acknowledges the gap but does not implement it.
- `packages/database/prisma/schema.prisma:8-11` — `datasource db` has only `url`, no `directUrl`.
- Prisma's default pool formula: `num_physical_cpus × 2 + 1`. On a Vercel x86 lambda (1-2 vCPU), that is 3-5 connections. The concern is not per-lambda size; it is **total connections across all concurrent lambdas**.

### 1.2 Failure mode it fixes

At ~100 simultaneous web users:
- Vercel may have 50-100 warm lambdas.
- Each lambda opens its own Prisma pool → 150-500 direct Postgres connections.
- Managed Postgres plans typically cap at 100-250 (Neon Free: 10-100; Supabase Pro: 200; AWS RDS small: 100).
- First symptom is intermittent `ERROR: sorry, too many clients already` or Prisma's `Timed out fetching a new connection from the connection pool`.
- Second symptom is cascading 5xx on every endpoint that touches the DB — including `/api/oauth/token`, so users can't log in.

This has not happened in prod yet because real traffic is low. A single load test at 200 CCU will trigger it.

### 1.3 Why now

Every other P0 item assumes the DB is reachable. P0-3 (Redis rate limiter) and P0-4 (OAuth hardening) both rely on DB reads continuing to work under the load they're being built for. Fix this first.

---

## 2. Goal / Non-goals

**Goal.** Under a sustained 500 concurrent request load, Postgres `pg_stat_activity` holds a bounded number of connections (≤ 50) and no Prisma client observes `connection pool timeout`.

**Non-goals.**
- Not choosing the managed Postgres provider — that's a separate decision captured in the index `§5`.
- Not migrating data to a different database.
- Not changing the schema beyond the `directUrl` wire-up.
- Not self-hosting PgBouncer yet (could be a future step if provider-pooler proves unreliable).

---

## 3. Options considered

### Option A — Client-side `connection_limit=1`, no pooler
Append `?connection_limit=1&pool_timeout=10` to the existing `DATABASE_URL`. No pooler.

- ✅ Zero infra change.
- ✅ Each lambda holds 1 connection, so 500 lambdas = 500 connections. Still at/above the plan cap.
- ❌ Doesn't actually solve the problem at 10K CCU.
- **Rejected.** Kicks the can down the road.

### Option B — Provider-side pooler (PgBouncer) in *transaction* mode (RECOMMENDED)
Use the managed provider's pooler endpoint (Neon: `-pooler.neon.tech`, Supabase: port `6543`, AWS RDS Proxy, DO Managed PG pool). Append `?pgbouncer=true&connection_limit=1`.

- ✅ Pooler multiplexes many clients onto few backend connections.
- ✅ `connection_limit=1` per lambda is correct when a pooler fronts the DB.
- ⚠ Transaction-mode pooling **disables prepared statements**. Prisma 5.7+ handles this, but we verify.
- ⚠ Long-running transactions block a pooler slot — we must check every `$transaction` call site.

### Option C — Prisma Accelerate
Managed Prisma product — pooled + edge-cached.

- ✅ Zero config beyond swapping URL to `prisma://…`.
- ✅ Adds free query caching.
- ❌ Vendor lock-in.
- ❌ Monthly cost at 10K CCU is non-trivial.
- **Deferred.** Reconsider as a replacement once we're on IaaS and paying for our own pooler VM.

### Option D — Self-hosted PgBouncer on a dedicated VM
Stand up a PgBouncer VM in front of the DB.

- ✅ Full control, works with any Postgres host.
- ❌ One more thing to operate.
- **Deferred to IaaS cutover (Wave 3).** Today, the provider pooler is simpler and sufficient.

**Chosen: Option B.**

---

## 4. Design

### 4.1 Final env shape per app

```
# Runtime — points at the pooler (port 6543 on Supabase/most providers)
DATABASE_URL=postgresql://<user>:<pw>@<pooler-host>:6543/<db>?pgbouncer=true&connection_limit=1&pool_timeout=10

# Migrations only — points at the primary (port 5432), bypassing pooler
DATABASE_URL_DIRECT=postgresql://<user>:<pw>@<primary-host>:5432/<db>?connection_limit=1
```

Three apps × three envs (dev/uat/prod) = 9 env-var pairs. Vercel dashboard has a bulk-edit; IaaS env files are per-VM.

### 4.2 Schema change

**File:** `packages/database/prisma/schema.prisma` (line 8-11)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")           // pooled (transaction mode)
  directUrl = env("DATABASE_URL_DIRECT")    // unpooled (migrations)
}
```

No data migration — purely a schema declaration change. `prisma migrate` will now hit the direct URL; app runtime still uses the pooled URL.

### 4.3 Client code change

**File:** `packages/database/index.ts` (lines 62-75)

Current code constructs `PrismaClient` with `datasources.db.url = process.env.DATABASE_URL`. No change needed to the code itself — Prisma reads the URL from env. The comment on lines 73-75 that explains the pool-size knob can be updated to reflect the new setup.

Recommended (but not required) comment refresh:

```ts
// Connection pool shape:
//   Runtime (DATABASE_URL) → pooler in transaction mode. connection_limit=1
//   per lambda; the pooler multiplexes across a small backend connection pool
//   (~20-40 slots shared across all lambdas).
//   Migrations (DATABASE_URL_DIRECT, via schema.prisma's directUrl) bypass
//   the pooler so DDL / advisory locks work.
```

### 4.4 Transaction-mode compatibility audit

Transaction-mode PgBouncer:
- No prepared statements reused across commands. Prisma ≥ 5.0 disables prepared statement caching when `?pgbouncer=true` is present — confirmed compatible.
- No `LISTEN/NOTIFY`. We don't use these.
- No session-level settings (`SET`, `SET LOCAL` inside a transaction is fine). We don't use `SET`.
- Advisory locks are per-session, so they do not survive transaction boundaries. We use them only in migrations (which bypass the pooler via `directUrl`). Safe.
- Long-running transactions hold a pooler slot. We must audit `$transaction` calls.

**`$transaction` call-site audit:**

```bash
rg "\\\$transaction\\(" --type ts
```

Known call sites (from audit report §2.5):
- `apps/quikscale/app/api/meetings/[id]/route.ts:136-141` — `[deleteMany, createMany]` atomic array. Sub-second. ✅ Safe.
- `apps/admin/app/api/members/[id]/route.ts:143-151` — `[deleteMany, createMany]` atomic array. Sub-second. ✅ Safe.

**Action:** re-run the grep during implementation to catch any added since the audit. Any `$transaction(async (tx) => { … })` with `await fetch(…)` inside, or with loop-scoped work over > ~10 records, must be rewritten before this ships.

### 4.5 Provider-specific notes

**Chosen provider: Neon** (see `docs/plans/VERCEL-PROD-SETUP.md` for the
full environment-wiring checklist, including Neon + Upstash + Vercel env
vars per project).

Neon URL shape:
- **Runtime (pooler):**
  `postgres://<user>:<pw>@ep-xxx-POOLER.<region>.aws.neon.tech/<db>?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=10`
- **Migrations (direct):**
  `postgres://<user>:<pw>@ep-xxx.<region>.aws.neon.tech/<db>?sslmode=require`
  (same hostname, drop `-pooler`).

Other providers considered but not chosen (listed only if we ever switch):

| Provider | Pooler URL shape | Notes |
|---|---|---|
| **Supabase** | `postgresql://user:pw@db.xxx.supabase.co:6543/postgres?pgbouncer=true` | Port 6543 = transaction pooler; port 5432 = direct. |
| **AWS RDS Proxy** | Needs IAM token or static password via proxy endpoint. | More setup; skip unless already on AWS. |
| **DigitalOcean Managed PG** | Requires enabling connection pool in UI, then use the `?pool=<name>` connection string. | Pooler is per-database-pool, not a different URL. |

### 4.6 Rollout order

1. Create pooler resource in chosen provider's UI.
2. In Vercel, for each of the 3 projects × 3 environments, **add** `DATABASE_URL_DIRECT` (new variable, points at direct URL).
3. **Edit** `DATABASE_URL` in Vercel to point at pooler with `?pgbouncer=true&connection_limit=1&pool_timeout=10`.
4. Merge schema change (`directUrl` line in `schema.prisma`) and the comment refresh in `packages/database/index.ts` to `dev` first.
5. Deploy to dev → run `npx prisma migrate deploy` via CI (should succeed via `directUrl`).
6. Smoke test: one authed request on each app.
7. Cherry-pick to `uat` → repeat.
8. Cherry-pick to `main` → repeat.
9. Run load test (§7) against prod off-hours.

---

## 5. Code changes (diff sketch)

### `packages/database/prisma/schema.prisma`

```diff
 datasource db {
-  provider = "postgresql"
-  url      = env("DATABASE_URL")
+  provider  = "postgresql"
+  url       = env("DATABASE_URL")
+  directUrl = env("DATABASE_URL_DIRECT")
 }
```

### `packages/database/index.ts`

Comment refresh only (optional). No runtime code change.

### `.env.example` (each app)

```diff
-DATABASE_URL="postgresql://..."
+# Runtime URL — points at the pooler in transaction mode.
+DATABASE_URL="postgresql://...pooler...?pgbouncer=true&connection_limit=1&pool_timeout=10"
+# Migrations URL — bypasses pooler. Required by Prisma for DDL.
+DATABASE_URL_DIRECT="postgresql://...primary..."
```

### `apps/*/next.config.js`

No change. Env vars are already passed through.

---

## 6. Migration considerations

- **No data migration.** This is purely wiring.
- **CI `prisma migrate deploy`** must use `DATABASE_URL_DIRECT`. Prisma reads `directUrl` from the schema automatically. No CI YAML change required; verify `DATABASE_URL_DIRECT` is in the Vercel build env.
- **Local dev:** developers' `.env.local` still uses a single URL to their local Postgres (no pooler needed). `directUrl` defaults to `url` when unset, so local dev is unaffected as long as both env vars exist — or `directUrl` can be the same string as `url`.
- **Snapshot compatibility.** Existing `__tests__/helpers/mockDb.ts` doesn't touch real Postgres. No test change needed.

---

## 7. Verification

### 7.1 Smoke (manual, pre-deploy)

For each environment (dev → uat → prod):

```bash
# One authed request per app
curl -fsSL https://<app-host>/api/health
curl -fsSL https://<auth-host>/.well-known/openid-configuration | jq -e '.issuer'
```

### 7.2 Load test (gate for prod sign-off)

New file: `tests/load/oauth-login.js` (k6 script, not implemented yet — committed as part of this plan).

Sketch:
```js
import http from 'k6/http';
import { check } from 'k6';
export const options = {
  scenarios: {
    concurrent_auth: {
      executor: 'constant-vus',
      vus: 500,        // 500 concurrent virtual users
      duration: '3m',
    },
  },
};
export default function () {
  const r = http.get('https://auth.yourco.com/.well-known/openid-configuration');
  check(r, { 'status 200': (res) => res.status === 200 });
}
```

**Gate:** k6 reports p95 < 300 ms and zero 5xx.

### 7.3 DB-side verification

During the load test, run on the primary Postgres:

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Expectation:** `active + idle in transaction + idle` is **≤ 40** in total, regardless of CCU. If it scales linearly with CCU, the pooler is being bypassed.

### 7.4 Automated regression

Add a CI step on PRs that touch `schema.prisma` or `packages/database/index.ts`:

```yaml
- name: Verify directUrl is still declared
  run: |
    grep -q "directUrl" packages/database/prisma/schema.prisma || {
      echo "directUrl removed from schema — P0-1 regression"; exit 1
    }
```

---

## 8. Rollback

**Trigger for rollback:** 5xx rate > 1% sustained 5 minutes after deploy, or `connection pool timeout` errors in logs.

**Procedure:**
1. Revert `DATABASE_URL` in Vercel to the direct (non-pooler) URL.
2. Redeploy (Vercel uses cached build; instant).
3. App keeps working on direct connections — the only regression is we've re-exposed ourselves to pool exhaustion under load, which is fine at current traffic.
4. Leave `DATABASE_URL_DIRECT` in place (harmless) and keep `schema.prisma` with `directUrl` in place (harmless).
5. Root-cause before re-attempting.

**Rollback time:** < 5 minutes.

---

## 9. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Some `$transaction` call we didn't find is long-running → saturates pooler | Low | High | Re-run grep at implementation; add TTL monitor on pooler dashboard; alert on `active_txn_time > 5s`. |
| R2 | Prisma + PgBouncer prepared-statement bug surfaces on a specific query | Low | Medium | Prisma 5.7+ handles this. Load test surfaces it; rollback is fast. |
| R3 | Migration fails because CI can't reach `DATABASE_URL_DIRECT` (firewall on primary) | Medium | High | Validate direct URL works from CI *before* touching runtime URL. Run `npx prisma migrate status` in CI first. |
| R4 | Pooler-side connection limit is too low for our fleet (e.g., Neon Free = 10) | Medium | High | Pick a pool tier that supports ≥ 40 connections. Verify with chosen provider before merging. |
| R5 | Developer workstations break because `.env.local` only has `DATABASE_URL` | High | Medium | Update `.env.example` in the PR and ping #eng in Slack. Correction to earlier doc version: Prisma 5.22 does **NOT** fall back to `url` when `DATABASE_URL_DIRECT` is unset — it errors with P1012. Devs must set both env vars even if pointing at the same URL. |
| R6 | Connection idle timeout (default: pooler kicks idle after 10-30 s) causes spurious errors on low-traffic endpoints | Low | Low | Prisma reconnects automatically; log samples will show the pattern; tune `idle_timeout` on pooler if we see it. |

---

## 10. Effort

| Task | Owner | Estimate |
|---|---|---|
| Choose provider + create pooler resource | Platform | 1 hr |
| Update 9 env-var pairs (3 apps × 3 envs) in Vercel | Platform | 30 min |
| `schema.prisma` + `packages/database/index.ts` PR | Backend | 30 min |
| `$transaction` audit (re-grep) | Backend | 15 min |
| Write `tests/load/oauth-login.js` | Backend | 1 hr |
| Smoke test + load test per environment | Platform | 1 hr |
| Burn-in (48 h with monitoring) | Platform | wall time |

**Total active engineer time:** ~4 hours. **Calendar time including burn-in:** ~3 days.

---

## 11. Open questions

- [ ] Which managed Postgres provider? _(Cross-cutting decision in index §5.)_
- [ ] Do we want the k6 load test as a blocking CI step on `main`, or only as a manual gate? _Recommendation: manual for now, blocking when we have dedicated load-test infra in Wave 3._
- [ ] Should `DATABASE_URL_DIRECT` also be used by the `/api/health/ready` probe for a separate "primary reachable?" check? _Recommendation: yes, as a P1 follow-up — out of scope here._

---

## 12. Sign-off

- [ ] Engineering lead approved the approach
- [ ] Provider choice decided and captured in index `§5`
- [ ] `$transaction` audit re-run and clean
- [ ] Dev deployed & smoke tested
- [ ] UAT deployed & load-tested at 500 CCU
- [ ] Prod deployed
- [ ] 48-hour burn-in clean → status flipped to `✔ Done` in index

## Appendix — references

- Prisma PgBouncer guide: https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel#configuring-a-connection-pool-with-pgbouncer
- Prisma `directUrl`: https://www.prisma.io/docs/orm/reference/prisma-schema-reference#directurl
- PgBouncer modes: https://www.pgbouncer.org/usage.html (see `pool_mode=transaction`)
