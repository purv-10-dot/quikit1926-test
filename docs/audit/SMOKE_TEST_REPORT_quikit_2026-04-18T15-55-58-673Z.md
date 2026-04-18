# Smoke Test Report — quikit

- Base URL: `https://quik-it-auth.vercel.app`
- Auth mode: **public-only**
- Started: 2026-04-18T15:55:58.673Z
- Finished: 2026-04-18T15:56:11.692Z
- Requests per endpoint: 30 (concurrency 4)

## Summary

| Metric | Value |
|---|---|
| Endpoints hit | 5 |
| Total requests | 150 |
| Total errors (5xx or fetch-fail) | 0 |
| Error rate | 0.00% |
| Overall p50 (of per-endpoint p50s) | 279ms |
| Overall p95 (of per-endpoint p95s) | 1717ms |
| Overall p99 (of per-endpoint p99s) | 1823ms |

## quikit — auth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/auth/session` | public | 30 | 0 | 200×30 | 279ms | 1717ms | 1823ms | 427ms |
| GET `/api/auth/providers` | public | 30 | 0 | 200×30 | 276ms | 351ms | 351ms | 288ms |
| GET `/api/auth/csrf` | public | 30 | 0 | 200×30 | 304ms | 344ms | 344ms | 301ms |

## quikit — oauth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/oauth/jwks` | public | 30 | 0 | 200×30 | 27ms | 613ms | 666ms | 109ms |
| GET `/api/oauth/diag` | public | 30 | 0 | 200×30 | 303ms | 668ms | 685ms | 353ms |

## Slow endpoints (p95 > 500ms)

| Endpoint | p95 | p99 | avg |
|---|---|---|---|
| GET `/api/auth/session` | 1717ms | 1823ms | 427ms |
| GET `/api/oauth/diag` | 668ms | 685ms | 353ms |
| GET `/api/oauth/jwks` | 613ms | 666ms | 109ms |
