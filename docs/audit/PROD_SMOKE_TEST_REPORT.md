# QuikIT Production Smoke-Test Report

**Branch:** `main` (post-merge-session) · **Date:** 2026-04-18

## 1. Executive summary

This report captures a full pre-prod smoke of the QuikIT monorepo — 3 Next.js apps
with **136 API routes** total. A Node-based latency harness
(`scripts/smoke-test.mjs`) was built to hit curated GET-only endpoint catalogs per
app and report p50/p95/p99 per module.

**Results:**
- ✅ **Test suite: 1331 tests green** across 4 test roots (quikscale 975,
  quikit 238, admin 57, shared 60, auth 1).
- ✅ **Builds: all 3 apps build cleanly** (sentry-test routes removed — they had
  served their temp-Sentry-smoke purpose).
- ⚠️ **Live latency (local):** quikit public endpoints healthy (p50 7–33ms);
  quikscale's dev server had a stale `.next` cache at run time (returning 500s
  because the user's long-running dev server hadn't picked up the merged code).
  The harness captured all responses correctly — the data reflects a stale dev
  server, NOT the merged code.
- 🎯 **Harness is ready** to point at Vercel UAT/prod with a real auth cookie.

## 2. Build verification

```bash
npx turbo build
# Tasks:    3 successful, 3 total
# Time:     16.376s
```

| App | Status | Notes |
|---|---|---|
| quikscale | ✅ PASS | Full build + static export |
| quikit | ✅ PASS | Full build + static export |
| admin | ✅ PASS | Full build + static export |

The previous failure on `/api/sentry-test` was resolved by deleting those temp
routes — they existed only to verify Sentry alerting by throwing, and were marked
"DELETE after verifying Sentry works" in their source comments. Sentry smoke
already ran in an earlier session; the routes served their purpose.

## 3. Test suite — 1331 tests passing (baseline)

```bash
npx turbo test
```

| Workspace | Files | Tests |
|---|---|---|
| apps/quikscale | 61 | 975 |
| apps/quikit | 23 | 238 |
| apps/admin | 7 | 57 |
| packages/shared | 5 | 60 |
| packages/auth | 1 | 1 |
| **TOTAL** | **97** | **1331** |

All green. Full `turbo test` hit cache on this run (`Tasks: 5 successful, 5 total,
Cached: 5 cached, 5 total, FULL TURBO`) — baseline ratchets are clean.

## 4. API inventory — 136 routes

See `docs/audit/API_INVENTORY_AND_SMOKE.md` for the full per-module table.

| App | Routes | Modules |
|---|---|---|
| quikscale | 69 | health/metrics, auth/session, apps/org, kpi, priority/www/categories, opsp, meetings/daily-huddle, performance, settings |
| quikit | 47 | auth/oauth/org, apps, broadcasts, super (orgs/users/plans/apps/broadcasts/analytics/alerts/audit), cron |
| admin | 20 | auth/session, org/invitations, dashboard/apps/settings, members/roles/teams |

**Auth breakdown (unique routes):**
- public: ~18
- tenant: ~54
- admin (tenant-admin): ~20
- super-admin: ~38
- cron: 6

## 5. Latency measurements

The harness was exercised against whatever dev processes were running at test
time. For a proper prod-style measurement, rebuild and restart the apps first
(see §6).

### 5a. quikit — public endpoints (live run)

Base URL: `http://localhost:3000` · 20 req/endpoint · concurrency 4

| Module | Endpoint | p50 | p95 | p99 | avg | Status |
|---|---|---|---|---|---|---|
| auth | `/api/auth/session` | 12ms | **1084ms** | 1084ms | 218ms | 200 ×20 (warmup spike on first request) |
| auth | `/api/auth/providers` | 11ms | 13ms | 13ms | 11ms | 200 ×20 |
| auth | `/api/auth/csrf` | 33ms | 43ms | 43ms | 26ms | 200 ×20 |
| oauth | `/api/oauth/jwks` | 7.3ms | 281ms | 281ms | 57ms | 200 ×20 |
| oauth | `/api/oauth/diag` | 8.3ms | 98ms | 98ms | 25ms | 200 ×20 |

**Overall p50 across endpoints: 11ms. p95: 1084ms (single warmup outlier on
first /api/auth/session request in dev).**

Full report: `docs/audit/SMOKE_TEST_REPORT_quikit_2026-04-18T14-58-15-398Z.md`

### 5b. quikscale — public endpoints (live run)

Base URL: `http://localhost:3004` · 20 req/endpoint · concurrency 4

The quikscale dev server had a stale `.next` cache at the time of run
(`Cannot find module './chunks/vendor-chunks/next.js'`), so every request
returned a 500 body. The harness captured the status codes and latency
cleanly — latencies (~15–26ms p50, p95 ≤ 150ms) reflect the speed of the
error response only and are NOT a meaningful perf signal. See §6 for the
correct reproduction steps.

Full report: `docs/audit/SMOKE_TEST_REPORT_quikscale_2026-04-18T14-58-09-070Z.md`

### 5c. Tenant-scoped / admin / super-admin endpoints — NOT RUN

These require a live session cookie. Follow §6 to produce them.

## 6. How to reproduce on prod / uat

### Prerequisites

```bash
cd /Users/user/Documents/Claude_Code/QuikIT

# 1. Clean build all apps (avoids the stale-cache issue seen in §5b)
npm run build   # or: npx turbo build

# 2. Start each app on its canonical port
cd apps/quikscale && npm run start &   # 3004
cd apps/quikit && npm run start &      # 3000
cd apps/admin && npm run start &       # 3005

# 3. Seed the E2E tenant (or use a known test user in UAT)
cd /Users/user/Documents/Claude_Code/QuikIT
npm run db:seed:e2e
```

### Obtain an auth cookie

```bash
# Option A: log in once in a browser, then copy the
#   next-auth.session-token   cookie (or __Secure-next-auth.session-token on prod)

# Option B: scripted login via NextAuth credentials provider
curl -c /tmp/q.jar -s -X POST http://localhost:3004/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'email=e2e-admin@test.com&password=...&csrfToken=...'
# Extract the session cookie value from /tmp/q.jar
```

### Run the harness

```bash
# Public-only (no cookie)
BASE_URL=http://localhost:3004 APP=quikscale PUBLIC_ONLY=1 \
  node scripts/smoke-test.mjs

# Authenticated, full catalog
BASE_URL=http://localhost:3004 APP=quikscale \
  AUTH_COOKIE="next-auth.session-token=eyJhbGciOi..." \
  node scripts/smoke-test.mjs

# quikit super-admin
BASE_URL=http://localhost:3000 APP=quikit \
  AUTH_COOKIE="next-auth.session-token=..." \
  node scripts/smoke-test.mjs

# admin
BASE_URL=http://localhost:3005 APP=admin \
  AUTH_COOKIE="next-auth.session-token=..." \
  node scripts/smoke-test.mjs
```

### Point at Vercel UAT / prod

```bash
BASE_URL=https://uat-quikscale.vercel.app APP=quikscale \
  AUTH_COOKIE="__Secure-next-auth.session-token=..." \
  REQS=50 \
  node scripts/smoke-test.mjs
```

Reports are written to `docs/audit/SMOKE_TEST_REPORT_<app>_<iso-timestamp>.md`.

### Env vars on the harness

| Var | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:3004` | Target host |
| `APP` | `quikscale` | Endpoint catalog: `quikscale` \| `quikit` \| `admin` |
| `AUTH_COOKIE` | `""` | Full `Cookie:` header value (e.g. `next-auth.session-token=xyz`) |
| `REQS` | `30` | Requests per endpoint |
| `CONCURRENCY` | `4` | Parallel in-flight requests |
| `PUBLIC_ONLY` | `0` | Skip auth-required endpoints |
| `OUTPUT_DIR` | `docs/audit` | Where to write the report |

## 7. Known gaps

The harness **does not** exercise:

1. **Mutation routes (POST/PATCH/PUT/DELETE)** — would alter state. A safe
   smoke of these would need a dedicated "smoke tenant" and rollback after.
2. **Cron routes** (`/api/super/cron/*`) — have dual auth (CRON_SECRET or
   super-admin session) and side effects (invoices, alert eval, rollups).
   Test via `/api/super/cron/last-run` instead (already in the catalog).
3. **OAuth flows that need a client_id/redirect_uri** (`/api/oauth/authorize`,
   `/api/oauth/token`, `/api/oauth/userinfo`) — covered separately by the OIDC
   E2E tests in `apps/quikit/__tests__/e2e/`.
4. **Impersonation endpoints** — each request mutates session state.
5. **Dynamic-path endpoints** (anything with `[id]`) — would require fixture
   IDs seeded into the target DB. Can be added to the catalog with `:id`
   placeholders substituted from env vars.
6. **`/api/sentry-test`** — intentionally throws.

## 8. Recommendations

### High priority

- **Fix quikit + admin build failures** by guarding `/api/sentry-test` with
  `export const dynamic = "force-dynamic"` or returning early when
  `NEXT_PHASE === "phase-production-build"`. Without this, `npm run build`
  fails for both apps → no deployments possible via the standard pipeline.
- **Add a clean-rebuild step to the local smoke workflow** before pointing the
  harness at dev, to avoid stale-chunk 500s like the ones seen in §5b.

### Medium priority

- **Extend the harness with a mutation-safe POST canary** against a
  sentinel "smoke" KPI / Priority / WWW in a dedicated smoke tenant, so we
  measure write paths too (currently GET-only).
- **Wire `scripts/smoke-test.mjs` into CI** as a post-deploy step on UAT —
  fail the deploy if any endpoint errors or p95 exceeds a threshold.

### Low priority

- Extract per-app catalogs into `scripts/smoke/catalogs/{quikscale,quikit,admin}.mjs`
  once the list grows past ~50 endpoints each.
- Add per-endpoint expected status code (currently everything non-5xx counts as
  "ok"); 401/403 on auth-required endpoints without a cookie should be a pass,
  not flagged as an error.

### Observed slow endpoints (p95 > 500ms)

From the limited live run, only one endpoint crossed 500ms p95:

| Endpoint | p95 | Notes |
|---|---|---|
| `GET /api/auth/session` (quikit) | 1084ms | First-request warmup in dev. Should drop to <100ms in prod. Re-measure post-deploy to confirm. |

No other endpoint exceeded the 500ms threshold in the sampled set.

---

## Artifacts

- `docs/audit/API_INVENTORY_AND_SMOKE.md` — full 136-route inventory
- `scripts/smoke-test.mjs` — the harness (zero deps, ESM, built-in fetch)
- `docs/audit/SMOKE_TEST_REPORT_quikit_2026-04-18T14-58-15-398Z.md` — live quikit run
- `docs/audit/SMOKE_TEST_REPORT_quikscale_2026-04-18T14-58-09-070Z.md` — quikscale (stale-cache state, see §5b)
- This report: `docs/audit/PROD_SMOKE_TEST_REPORT.md`
