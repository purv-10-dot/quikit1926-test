# Smoke Test Report — quikit

- Base URL: `http://localhost:3000`
- Auth mode: **public-only**
- Started: 2026-04-18T15:01:57.492Z
- Finished: 2026-04-18T15:01:57.927Z
- Requests per endpoint: 20 (concurrency 4)

## Summary

| Metric | Value |
|---|---|
| Endpoints hit | 5 |
| Total requests | 100 |
| Total errors (5xx or fetch-fail) | 0 |
| Error rate | 0.00% |
| Overall p50 (of per-endpoint p50s) | 8.6ms |
| Overall p95 (of per-endpoint p95s) | 82ms |
| Overall p99 (of per-endpoint p99s) | 82ms |

## quikit — auth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/auth/session` | public | 20 | 0 | 200×20 | 14ms | 45ms | 45ms | 17ms |
| GET `/api/auth/providers` | public | 20 | 0 | 200×20 | 8.6ms | 10ms | 10ms | 8.7ms |
| GET `/api/auth/csrf` | public | 20 | 0 | 200×20 | 9.0ms | 11ms | 11ms | 9.0ms |

## quikit — oauth module

| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |
|---|---|---|---|---|---|---|---|---|
| GET `/api/oauth/jwks` | public | 20 | 0 | 200×20 | 8.0ms | 70ms | 70ms | 19ms |
| GET `/api/oauth/diag` | public | 20 | 0 | 200×20 | 8.5ms | 82ms | 82ms | 19ms |
