# Production Smoke Test — Live Results

**Date:** 2026-04-18 · **Target:** Vercel production · **Run from:** local (`scripts/smoke-test.mjs`)

## Targets

| App | URL | HTTP reachable |
|---|---|---|
| quikit (IdP) | `https://quik-it-auth.vercel.app` | ✅ |
| quikscale | `https://quikscale.vercel.app` | ✅ |
| admin | `https://quik-it-admin.vercel.app` | ✅ |

## Summary

| Metric | Value |
|---|---|
| Total requests sent | **360** (12 endpoints × 30 requests) |
| HTTP errors (5xx / network fail) | **0** |
| Error rate | **0.00%** |
| Auth mode | public-only (no session cookie — only public endpoints hit) |
| Fastest endpoint (p50) | `/api/health` → 26ms (quikscale) |
| Slowest endpoint (p50) | `/api/health/ready` → 308ms (quikscale cold start) |
| Slowest endpoint (p95) | `/api/auth/session` → 1826ms (admin cold start) |

**Overall: every public endpoint on every app returns 200 under load. Zero errors.**

## Per-app per-module results

### quikit (`quik-it-auth.vercel.app`)

| Module | Endpoint | Status | p50 | p95 | p99 | Avg |
|---|---|---|---|---|---|---|
| auth | `/api/auth/session` | 200×30 | 279ms | 1717ms | 1823ms | 326ms |
| auth | `/api/auth/providers` | 200×30 | 276ms | 351ms | 351ms | 291ms |
| auth | `/api/auth/csrf` | 200×30 | 304ms | 344ms | 344ms | 308ms |
| oauth | `/api/oauth/jwks` | 200×30 | **27ms** | 613ms | 666ms | 82ms |
| oauth | `/api/oauth/diag` | 200×30 | 303ms | 668ms | 685ms | 337ms |

**Observation:** `/api/oauth/jwks` has the best p50 (27ms — cached) but occasional cold-start spikes to 600+ms on p95. `/api/auth/session` showed one request at 1823ms — a single cold-start warmup.

### quikscale (`quikscale.vercel.app`)

| Module | Endpoint | Status | p50 | p95 | p99 | Avg |
|---|---|---|---|---|---|---|
| health | `/api/health` | 200×30 | **26ms** | 692ms | 712ms | 80ms |
| health | `/api/health/ready` | 200×30 | 294ms | 1412ms | 1412ms | 349ms |
| auth | `/api/auth/session` | 200×30 | 282ms | 346ms | 428ms | 298ms |
| auth | `/api/auth/providers` | 200×30 | 291ms | 346ms | 483ms | 308ms |
| auth | `/api/auth/csrf` | 200×30 | 308ms | 356ms | 356ms | 313ms |

**Observation:** `/api/health` is fast (p50 26ms — probably a simple "alive" check). `/api/health/ready` is slower because it likely hits DB/Redis to check dependencies.

### admin (`quik-it-admin.vercel.app`)

| Module | Endpoint | Status | p50 | p95 | p99 | Avg |
|---|---|---|---|---|---|---|
| auth | `/api/auth/session` | 200×30 | 315ms | 1826ms | 1827ms | 406ms |
| auth | `/api/auth/providers` | 200×30 | 275ms | 320ms | 329ms | 283ms |

**Observation:** Admin had the biggest cold-start tail — single request at 1827ms. Steady state is fine (p50 275-315ms).

## Ad-hoc probes (beyond the harness)

| Probe | Result |
|---|---|
| `GET /` on all 3 apps | 307 redirect (to login — expected) |
| `GET /login` on all 3 apps | 200 OK (login page renders) |
| `GET /.well-known/openid-configuration` on quikit | **200 OK** — issuer = `https://quik-it-auth.vercel.app` ✅ matches config |
| `GET /api/apps/switcher` on quikit (no auth) | 404 — correct (different route path; super-admin uses `/api/apps/launcher`) |
| `GET /api/apps/switcher` on quikscale/admin (no auth) | **401 Unauthorized** ✅ auth guard working |

## Latency distribution visualization

```
p50 range:     ████████████████   26ms - 315ms   (warm)
p95 range:     ████████████████████████████████████████   320ms - 1826ms   (cold starts included)
p99 range:     ████████████████████████████████████████████   329ms - 1827ms   (worst case)
```

## Cold-start analysis

Three endpoints showed p95 > 1000ms, all of which correspond to **first request to a cold Lambda function**:

| Endpoint | p50 | p95 | Ratio p95:p50 |
|---|---|---|---|
| admin `/api/auth/session` | 315ms | 1826ms | 5.8× |
| quikit `/api/auth/session` | 279ms | 1717ms | 6.1× |
| quikscale `/api/health/ready` | 294ms | 1412ms | 4.8× |

This is **normal Vercel serverless behavior** — after cold-start, subsequent requests are fast. Can be mitigated with Vercel's Edge runtime, pro-tier warmup, or Incremental Static Regeneration for cacheable endpoints.

## What's NOT covered

Per design, the harness is GET-only and public-auth-only. **Not tested:**

- Authenticated tenant endpoints (`/api/kpi`, `/api/priority`, `/api/opsp/*`, etc.) — need a session cookie
- Super-admin endpoints (`/api/super/*`) — need super-admin cookie
- POST/PATCH/DELETE (mutations — would alter prod data)
- Cron endpoints (`/api/super/cron/*`) — dual-auth, should be triggered manually
- Error paths (deliberately throwing)

To measure authenticated endpoints, log in to each app in your browser, grab the `__Secure-next-auth.session-token` cookie, and re-run:

```bash
BASE_URL=https://quikscale.vercel.app \
AUTH_COOKIE="__Secure-next-auth.session-token=<paste>" \
APP=quikscale REQS=50 \
  node scripts/smoke-test.mjs
```

## Verdict

**Production is healthy.** All 3 apps up, all public endpoints returning 200, OIDC discovery wired correctly, auth guards working on protected routes. Cold-start p95 is acceptable for a pre-revenue stage; revisit when you have paying customers.

## Warnings

- **No Sentry DSN configured yet (from earlier sessions):** if a prod 500 happens, you won't see it in Sentry until you set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel env vars. The code is wired — just missing env vars.
- **`CRON_SECRET` not set:** the 2 scheduled crons (cleanup-api-calls, generate-invoices) can't run. No business impact yet (no tenants past their billing period), but will matter soon.
- **No CDN warmup:** if you demo to enterprise customers, consider hitting a "warmup" endpoint before the demo to avoid the cold-start tail.
