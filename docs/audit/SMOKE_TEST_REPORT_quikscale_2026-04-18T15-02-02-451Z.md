# Smoke Test Report — quikscale

- Base URL: `http://localhost:3004`
- Auth mode: **public-only**
- Started: 2026-04-18T15:02:02.451Z
- Finished: 2026-04-18T15:02:03.001Z
- Requests per endpoint: 20 (concurrency 4)

## Summary

| Metric | Value |
|---|---|
| Endpoints hit | 5 |
| Total requests | 100 |
| Total errors (5xx or fetch-fail) | 60 |
| Error rate | 60.00% |
| Overall p50 (of per-endpoint p50s) | 14ms |
| Overall p95 (of per-endpoint p95s) | 95ms |
| Overall p99 (of per-endpoint p99s) | 95ms |

## quikscale — auth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/auth/session` | public | 20 | 20 | 500×20 | 18ms | 95ms | 95ms | 32ms |
| GET `/api/auth/providers` | public | 20 | 20 | 500×20 | 16ms | 18ms | 18ms | 15ms |
| GET `/api/auth/csrf` | public | 20 | 20 | 500×20 | 14ms | 17ms | 17ms | 14ms |

## quikscale — health module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/health` | public | 20 | 0 | 200×20 | 11ms | 85ms | 85ms | 23ms |
| GET `/api/health/ready` | public | 20 | 0 | 200×20 | 9.8ms | 41ms | 41ms | 16ms |

## Endpoints with errors

| Endpoint | Errors | Status codes |
|---|---|---|
| GET `/api/auth/session` | 20 | 500×20 |
| GET `/api/auth/providers` | 20 | 500×20 |
| GET `/api/auth/csrf` | 20 | 500×20 |
