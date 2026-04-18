# Smoke Test Report — quikscale

- Base URL: `https://quikscale.vercel.app`
- Auth mode: **public-only**
- Started: 2026-04-18T15:56:16.967Z
- Finished: 2026-04-18T15:56:30.679Z
- Requests per endpoint: 30 (concurrency 4)

## Summary

| Metric | Value |
|---|---|
| Endpoints hit | 5 |
| Total requests | 150 |
| Total errors (5xx or fetch-fail) | 0 |
| Error rate | 0.00% |
| Overall p50 (of per-endpoint p50s) | 291ms |
| Overall p95 (of per-endpoint p95s) | 1412ms |
| Overall p99 (of per-endpoint p99s) | 1412ms |

## quikscale — auth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/auth/session` | public | 30 | 0 | 200×30 | 282ms | 346ms | 428ms | 297ms |
| GET `/api/auth/providers` | public | 30 | 0 | 200×30 | 291ms | 346ms | 483ms | 300ms |
| GET `/api/auth/csrf` | public | 30 | 0 | 200×30 | 308ms | 356ms | 356ms | 308ms |

## quikscale — health module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/health` | public | 30 | 0 | 200×30 | 26ms | 692ms | 712ms | 122ms |
| GET `/api/health/ready` | public | 30 | 0 | 200×30 | 294ms | 1412ms | 1412ms | 443ms |

## Slow endpoints (p95 > 500ms)

| Endpoint | p95 | p99 | avg |
|---|---|---|---|
| GET `/api/health/ready` | 1412ms | 1412ms | 443ms |
| GET `/api/health` | 692ms | 712ms | 122ms |
