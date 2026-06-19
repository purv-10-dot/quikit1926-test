# HRMS — Code + Redis Behaviour (Feature-by-Feature Flow)

*This document does **not** explain what Redis or BullMQ are. It traces, for **every HRMS feature that touches Redis**, exactly what **our code** does step-by-step: what we write to Postgres, what we put in Redis, what the screen shows, what happens when the Redis entry's **TTL expires / the job is removed**, and whether the code then **falls back to a database call**. Source-verified against the actual code (file paths/lines cited in each section).*

---

## 1. How to read this — Redis plays exactly 3 roles in our code

Every Redis touch in HRMS is one of these three. Knowing which role a feature uses tells you instantly what "TTL expiry" means for it.

| Role | What our code stores in Redis | Is it the source of truth? | What happens at TTL / removal |
|---|---|---|---|
| **A. Job queue (BullMQ)** | A transient *job* describing work to do (e.g. "import these rows", "compute this payroll run", "send this email"). | **No.** The real record is a row in **Postgres** (`DataImport`, `PayRun`, `Invitation`, …). | Job is auto-deleted ~1h after success / 2d after failure. The Postgres row remains; the screen reads Postgres. |
| **B. Read-through cache (TTL)** | A *copy* of a Postgres read (permissions, profile, unread count, leave policy) **or** a pre-computed snapshot (org-chart, compensation analytics, birthdays/anniversaries). | **No.** Always a copy of Postgres. | On expiry the **next request misses Redis and re-runs the Postgres query** (the loader), then re-caches. This is the DB fallback. |
| **C. Pub/sub message bus** | **Nothing is stored.** A one-shot message is published on a channel and forwarded to connected browsers (SSE). | n/a | n/a — it's a signal, not storage. The browser reacts by **re-fetching from Postgres**. |

> **The single most important sentence for the reviewer:** *No business data lives permanently in Redis.* Postgres is always the source of truth. Redis is either (A) a to-do list for the worker, (B) a short-lived cached copy that rebuilds from Postgres when it expires, or (C) a doorbell that tells the screen "go re-fetch from Postgres."

---

## 2. Direct answers to the two examples raised on the call

### a) "The email trigger button — what does the code + Redis do?"
**There is no standalone 'send email' button.** Email is always a **side-effect of a domain action**. The button being referred to is most likely **Invite** (Settings → Users). Flow (Role A — job queue):

1. Click **Invite** → `POST /api/v1/hrms/invitations`.
2. Code **writes the `Invitation` row to Postgres first** (this is the real record).
3. Code then **enqueues an `email` job to Redis** (BullMQ) — the job carries the to-address, subject, HTML.
4. The **worker** picks the job up and sends it via SMTP (nodemailer).
5. On success the job is **removed from Redis ~1h later** (`removeOnComplete`). The invitation/notification record stays in Postgres.
6. **Screen:** shows a success toast immediately; the Users list reflects the Postgres `Invitation` row. The email send itself is fire-and-forget.
7. **If Redis is down:** the single-invite path **falls back to sending inline** (so one invite still works); bulk/notification emails are skipped but the in-app notification row is still written. Full trace: **Flow B → Feature 1**.

### b) "The anniversary item — it sits with a TTL, then is removed; does the code re-call the DB?"
**Yes, this one is genuinely Redis-cached (Role B), and your observation is correct.** Birthdays/anniversaries/celebrations are cached with a **300-second TTL** (`celebrations:{orgId}`, `birthdays:{orgId}`, `anniversaries:{orgId}`).

- The data is **computed from Postgres**, cached in Redis for 5 minutes, and served from cache on repeat loads.
- **When the 300s TTL expires, the key disappears from Redis (what you saw).** The screen does **not** instantly change — TTL expiry does not push anything to the browser. Instead, **the next time the widget loads (page reload / tab refocus / React Query staleness), the code misses Redis and re-runs the Postgres query**, then re-caches for another 300s.
- So: **expiry ≠ screen update.** The DB re-call happens on the *next request*, not at the instant the key vanishes. Full trace: **Flow D → Part 3**.

---

## 3. Master map — every Redis-backed feature at a glance

| Feature | Role | Redis key / queue | TTL / lifetime | In Redis | In Postgres (source of truth) | Screen update | DB fallback on expiry/miss |
|---|---|---|---|---|---|---|---|
| Bulk employee import | A | `bull:bulk-employee-import:*` | 1h after done | the import job + rows | `DataImport` + created `Employee` rows | **2s polling** of `DataImport` | reads `DataImport`/employees from PG |
| Bulk **bank** import | — | *(none)* | — | — | inline `Employee.update` (synchronous) | synchronous response | n/a (never uses Redis) |
| Payroll run (compute) | A | `bull:payroll-run:*` | 1h after done | job = `{runId}` only | `PayRun.compute*` cols + `Payslip` rows | React Query `refetchInterval` + SSE | reads `PayRun`/`Payslip` from PG |
| PDF (payslip release) | A | `bull:pdf-generation:*` | 1h after done | the job; PDF as email attachment | `Payslip` row (PDF **not** stored) | toast | re-build from PG via resend |
| Email (invite/notify) | A | `bull:email:*` | 1h after done | the email job | `Invitation`/`Notification` row | toast / list | n/a (email is transient) |
| Cron — ticket auto-close | A | scheduler in `cron-tickets` | repeatable | schedule only | `Ticket` rows | next load / SSE | all data in PG |
| Cron — ticket SLA breach | A | scheduler + delayed jobs | repeatable | schedule only | `Ticket` rows | next load / SSE | all data in PG |
| Permissions | B | `perms:{tenant}:{user}` | 300s | cached perm list | `UserAppRole`/`RolePermission`/extras | sidebar/nav | **re-query PG** on miss |
| Profile (me) | B | `employee-me:{tenant}:{user}` | 300s | cached profile | `Employee` | top bar | **re-query PG** on miss |
| Unread count | B | `notif-unread:{tenant}:{user}` | **15s** | cached count | `Notification` | bell badge | **re-count PG** on miss |
| Session re-validate | B | `session-valid:{authUserId}` | 60s | auth *verdict* | central auth (HTTP) | n/a | re-checks central on miss (fail-open) |
| Central membership | B | `central-member:{tenant}:{authUserId}` | 120s | membership *verdict* | central member API (HTTP) | n/a | re-checks central on miss (fail-open) |
| Active leave policy | B | `leave-policy-active:{tenant}` | 300s | cached policy rules | `LeavePolicy` | leave apply screen | **re-query PG** on miss |
| Org-chart snapshot | B | `org-chart:{tenant}` | 7 days | cached snapshot | `Employee` graph | org-chart page | **recompute from PG** on miss |
| Compensation analytics | B | `analytics:compensation:{tenant}` | 36h | cached snapshot | `EmployeeSalary` SQL | analytics page | **recompute from PG** on miss |
| Birthdays / anniversaries / celebrations | B | `birthdays:` / `anniversaries:` / `celebrations:{tenant}` | 300s | cached lists | `Employee` dates | home widgets | **re-query PG** on next load |
| Real-time updates (SSE) | C | channel `realtime:{tenant}` | none (signal) | nothing stored | the event's data is in PG | push → React Query refetch | browser re-fetches PG |
| Cross-instance cache bust | C | channel `quikit:cache-invalidate` | none (signal) | nothing stored | n/a | n/a | peers drop local copy |

*(Note: the rate limiter is **in-process memory, not Redis** — included here only to pre-empt the question.)*

---

## 4. The honest gaps (so nothing is oversold)

The traces below are truthful about where behaviour is imperfect. The ones worth knowing up front:

- **Bulk bank import does not use Redis/BullMQ at all** — it runs synchronously inside the HTTP request (up to ~5000 `Employee.update`s). The `bulk-bank-import` queue is a registered **no-op placeholder**.
- **Bulk-import screen uses its own 2-second polling loop**, not SSE — a full page reload loses the in-progress import id.
- **Repeatable crons only register in the standalone worker** (`worker/index.ts`), not in the embedded worker — on an embedded-only/Vercel deploy, auto-close/SLA/analytics aren't scheduled (the `/api/cron/*` HTTP routes are the fallback).
- **Org-chart drag-reassign invalidates the wrong React Query key** — the chart isn't refetched by that action (and even if it were, it could read the 7-day stale snapshot).
- **`employee-me` is not busted on profile edit** — an edited name/photo can be stale in the top bar for up to ~5 min.
- **New notifications don't bust `notif-unread`** — the badge can lag up to 15s (the short TTL is the only refresh).
- **Read endpoints never write back to Redis** — only the worker populates org-chart/analytics snapshots; without the worker, those reads recompute the heavy SQL every time (correct, just slower).
- **Caches with TTL-only eviction** (celebrations/birthdays/anniversaries) are never explicitly invalidated — editing a DOB shows up after ≤5 min.

---

## 5. What's in the rest of this document

- **Flow A** — BullMQ trigger flows: bulk import, payroll compute, PDF (button → queue → worker → Postgres → screen).
- **Flow B** — Email (the flagship example), ticket crons, analytics refresh, org-chart rebuild.
- **Flow C** — Read-through caches: permissions, profile, unread count, session/membership verdicts, leave policy (Redis → on miss → Postgres loader).
- **Flow D** — SSE real-time pipeline + the celebrations/anniversary caching (the second example), plus the home dashboard batch.

Each feature is traced with: **Trigger → numbered code path (with file:line) → Redis-vs-Postgres split → TTL/expiry behaviour → how the screen updates → degraded mode without Redis.**

---
