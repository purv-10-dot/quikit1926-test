# Smoke Test Report — admin

- Base URL: `https://quik-it-admin.vercel.app`
- Auth mode: **public-only**
- Started: 2026-04-18T15:56:35.358Z
- Finished: 2026-04-18T15:56:41.883Z
- Requests per endpoint: 30 (concurrency 4)

## Summary

| Metric | Value |
|---|---|
| Endpoints hit | 2 |
| Total requests | 60 |
| Total errors (5xx or fetch-fail) | 0 |
| Error rate | 0.00% |
| Overall p50 (of per-endpoint p50s) | 315ms |
| Overall p95 (of per-endpoint p95s) | 1826ms |
| Overall p99 (of per-endpoint p99s) | 1827ms |

## admin — auth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/auth/session` | public | 30 | 0 | 200×30 | 315ms | 1826ms | 1827ms | 444ms |
| GET `/api/auth/providers` | public | 30 | 0 | 200×30 | 275ms | 320ms | 329ms | 285ms |

## Slow endpoints (p95 > 500ms)

| Endpoint | p95 | p99 | avg |
|---|---|---|---|
| GET `/api/auth/session` | 1826ms | 1827ms | 444ms |
