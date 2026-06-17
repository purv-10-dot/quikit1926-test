# Flow B — Email, Cron, Analytics, Org-Chart (code + Redis end-to-end)

Traced from actual code under `apps/quikhrms`. All paths relative to that dir unless noted.

## Shared infrastructure (read this first)

Two **separate** Redis clients exist — do not conflate them:

| Client | File | Purpose | Config |
|---|---|---|---|
| **Queue connection** (BullMQ) | `src/lib/queue/connection.ts` | Job queues only | `maxRetriesPerRequest: null`, `enableReadyCheck: false`, `lazyConnect` |
| **Cache client** (`@quikit/redis`) | `packages/redis/index.ts` | `cacheGet/cacheSet/cacheDel` key-value cache (analytics + org-chart snapshots) | `maxRetriesPerRequest: 3`, retry/backoff |

- Queue helper `enqueue()` (`src/lib/queue/queues.ts:37`): **no-ops** (returns `""`) when `queueConnection` is null — never crashes the request.
- Default job options (`queues.ts:5`): `attempts: 3`, exp backoff 5s, **`removeOnComplete: { age: 3600, count: 100 }`** (completed jobs drop from Redis after 1h / keep last 100), `removeOnFail: { age: 2d }`.
- Cache helpers (`packages/redis/index.ts:143-175`): all swallow errors and return null/no-op when `REDIS_URL` is unset → callers fall through to live compute.
- Worker is **embedded** in the Next process via `src/instrumentation.ts:13` → `src/lib/queue/embedded-worker.ts` (one worker set per process, guarded by a global flag). A standalone `worker/index.ts` also exists (Dockerfile entry).

### ⚠ Surprising gap #1 — schedulers only run in the standalone worker
`registerSchedulers()` (`worker/schedulers.ts`) is called **only** from `worker/index.ts:53` (the standalone/Docker worker). The **embedded worker** (`embedded-worker.ts`) starts the processors but **never calls `registerSchedulers()`**. So if the app runs only as the embedded Next process (e.g. Vercel with no separate worker container), the repeatable crons (`tickets-auto-close`, `tickets-sla-breach`, `compensation-all-tenants`) are **never registered**, and the nightly analytics/org-chart staleness window is covered only by manual triggers and the HTTP cron-fallback routes. Per-ticket delayed SLA jobs and on-demand enqueues still work (they don't need the scheduler).

---

## FEATURE 1 — Email (flagship)

### Is there a literal "email trigger button"?
**No.** There is no button in the HRMS UI whose sole purpose is "send email". Email is **always a side-effect** of a domain action. The closest things to an explicit button:
- **Invite / Resend invite** (`settings/users`) → `POST /api/v1/hrms/invitations` (and `/[id]/resend`) → invite email.
- **Approve / Reject** leave/WFH → decision email.
- **Recruitment "Send offer / Send interview / Send welcome"** routes (`/api/v1/hrms/mail/{offer,interview,welcome}`) — these are the most "button-like" email sends, surfaced from the recruit pipeline/interviews pages.

So tell the reviewer: the "email trigger button" is really the **Invite button** (and the recruit *Send* actions). The button saves a DB record, then enqueues an email job as a side-effect — there is no standalone "email" button.

### Trigger
User clicks **Invite** in `settings/users` → `POST /api/v1/hrms/invitations` (`src/app/api/v1/hrms/invitations/route.ts:69`).

### Step-by-step flow (invitation)
1. `POST /invitations` validates body, blocks duplicate employee/invite, validates roles (`route.ts:78-96`) — **Postgres reads**.
2. `provisionMemberRemote(...)` provisions the person centrally in QuikIT SSO (`route.ts:102`) — external HTTP, not Redis.
3. `prisma.invitation.create({...})` — **Postgres write**: the invitation RECORD (email, roleIds, token hash, expiry, status Pending) is persisted (`route.ts:123`). Dual-write rollback via `deprovisionMemberRemote` if this fails (`route.ts:148`).
4. `dispatchInvitationEmail(...)` (`src/lib/services/invitation.ts:58`):
   - Builds subject+html from `buildInvitationEmail` (`invitation.ts:34`) — content is computed here, lives in the job payload.
   - `enqueue<EmailJobData>(QUEUE_NAMES.EMAIL, "invitation", {...})` (`invitation.ts:67`) → **Redis write**: `queue.add` pushes a job onto BullMQ list/stream for queue `email`. Payload = `EmailJobData` (`src/lib/queue/types.ts:45`): `{ orgId, to, subject, html, kind:"invitation" }`.
   - Returns `{ queued: true }`.
   - **Fallback (`invitation.ts:75`)**: if `enqueue` throws (Redis down), it calls `sendMail()` **inline** (synchronous SMTP on the request thread) so a single invite is not lost. (Note: `enqueue` itself no-ops rather than throwing when `queueConnection` is null, so the inline fallback fires mainly on a real Redis *error*, not on a cleanly-unset `REDIS_URL` — see Degraded mode.)
5. `createAuditLog(...)` — **Postgres write** (audit row, records `emailQueued`/`emailSent`).
6. Response 201 `{ emailSent: mail.queued || mail.sent }`.
7. **Worker** (`worker/processors/email.ts:5`): `emailProcessor` reads `job.data`, decodes any base64 attachments, calls `sendMail()` (`src/lib/services/mailer.ts:86`) → **nodemailer SMTP send**. On success returns; the job is then dropped from Redis by `removeOnComplete` (1h). On failure it throws → BullMQ retries (3 attempts, exp backoff).

### Other email triggers (all use the same `email` queue via `queueEmail`)
`queueEmail()` lives at `src/lib/services/mailer.ts:132` and enqueues an `EmailJobData` with a `kind` tag:
- **Ticket notifications** (`src/lib/services/ticket-notifications.ts:118`, `kind:"ticket.notify"`): created/assigned/status-change/comment/auto-closed/SLA-breach. Each first writes a `Notification` row + SSE publish (`notify()` at `ticket-notifications.ts:74-121`), then queues email to recipients' `workEmail`.
- **Leave decision** (`src/app/api/v1/hrms/leaves/requests/[id]/approve/route.ts:148`, `kind:"leave.decision"`): after the approve/reject transaction commits, a fire-and-forget IIFE builds the decision email and `queueEmail(...)`.
- **WFH approve/reject** (`wfh/requests/[id]/approve|reject/route.ts`) — same pattern.
- **Payroll / payslip** (`src/lib/services/payroll-notifications.ts:68`, `kind:"payroll.notify"`): `RUN_RELEASED` etc. notify employees + admins; payslip PDF emails go through `src/lib/services/payslip-release.ts`.
- **Recruitment** mail routes (`/api/v1/hrms/mail/{offer,interview,welcome}`) and candidate-doc / interview-feedback crons (`/api/v1/hrms/cron/*`).
- **Bulk import auto-invite** (`src/lib/services/invitation.ts:113` `inviteImportedEmployees`): bulk variant `queueInvitationEmail` — **enqueue-only, no inline fallback** (so a 100-row import can never block on SMTP).

### Redis vs Postgres split
| Redis (transient) | Postgres (durable) |
|---|---|
| The email **job** on the `email` queue (subject+html+to in payload) | The **Invitation / Notification / LeaveRequest / Payslip record** |
| Retry state, removed after `removeOnComplete` (1h) | Audit log of `emailQueued`/`emailSent` |
| Nothing about the email persists after send | The domain record persists indefinitely (soft-delete) |

The email **content is rendered into the job payload** (and the originating record lives in Postgres); the rendered HTML is **not** separately stored — once the worker sends via SMTP and the job completes, the payload is dropped from Redis.

### TTL-expiry / removal behavior
- Completed job → removed after 1h (`removeOnComplete.age=3600`). Failed job → kept 2 days then removed.
- There is **no "resend on expiry"** of the job. If a job is lost (e.g. Redis flushed) before sending, the email is simply never sent — the Invitation row stays `Pending`; recovery is the manual **Resend** button (`/api/v1/hrms/invitations/[id]/resend`). For ticket/leave/payroll emails there is no automatic re-send; the in-app `Notification` row (Postgres) is the durable record the user still sees.

### How the screen updates
- Invite: React-Query mutation → toast "email sent" (driven by `emailSent` flag) → list refetch. No SSE for the email itself.
- Ticket/leave/payroll notifications: the **in-app** side is pushed via SSE (`publishNotification` / `publishTicketUpdate` in `realtime.ts`), independent of whether the email job has sent yet.

### Degraded mode (no `REDIS_URL`)
- `queueConnection` is null → `enqueue` logs `[queue] skipped enqueue …` and returns `""` (`queues.ts:44`). **No job, no inline send** for the `queueEmail`-based paths (ticket/leave/payroll/bulk-invite) → those emails are silently dropped (in-app Notification still written).
- The **single invite** path (`dispatchInvitationEmail`) is the exception: because `enqueue` no-ops instead of throwing, the `catch` inline-send fallback is actually only reached on a Redis *error*, not on cleanly-missing `REDIS_URL`. With `REDIS_URL` truly unset, the single invite would also be dropped unless SMTP-inline is reached — worth flagging as a subtle behavior.
- If SMTP itself is unconfigured, `sendMail` returns `{ sent:false }` (`mailer.ts:88`) and the worker job throws → retries then lands in the failed set.

---

## FEATURE 2 — Cron: Tickets (auto-close + SLA breach)

### Trigger
Two repeatable BullMQ schedulers on the `cron-tickets` queue (`worker/schedulers.ts:15`):
- `tickets-auto-close` — `0 3 * * *` (daily 03:00)
- `tickets-sla-breach` — `0 * * * *` (hourly)

Plus **per-ticket delayed jobs** scheduled at exact SLA due time, and **HTTP fallback** routes.

### Step-by-step flow
**Auto-close** (`worker/processors/cron-tickets.ts:19` → `runAutoCloseSweep` in `src/lib/services/ticket-cron.ts:47`):
1. Scheduler fires → BullMQ delivers job `tickets-auto-close` (Redis → worker).
2. `prisma.ticketCategory.findMany({ autoCloseAfterDays > 0 })` — **Postgres read** (`ticket-cron.ts:48`).
3. Per category, `prisma.ticket.findMany({ status:"Resolved", resolvedAt <= cutoff })` — **Postgres read** (`ticket-cron.ts:59`).
4. `$transaction`: `ticket.updateMany → status "Closed"` + `ticketActivity.createMany` (`AutoClosed`) — **Postgres writes** (`ticket-cron.ts:76`).
5. `notifyTicketAutoClosed(...)` per ticket → in-app Notification (Postgres) + SSE + queued email (back onto the `email` queue).

**SLA breach** (`cron-tickets.ts:26` → `runSlaBreachSweep`, `ticket-cron.ts:118`):
1. Scheduler/hourly job fires (Redis → worker).
2. Three Postgres scans: response breaches (`slaResponseDueAt < now`, not yet breached), first resolve breaches (`slaResolveDueAt < now`), and ongoing escalations (`escalationLevel < 3`).
3. Per breach: `$transaction` sets `responseBreachedAt`/`resolveBreachedAt`/`escalationLevel`, writes `ticketActivity` — **Postgres writes**.
4. `getEscalationRecipients` (admins) → `notifyTicketSlaBreach` → Notification + SSE + queued email.

**Per-ticket exact-time jobs** (`src/lib/services/ticket-sla-scheduler.ts`):
- On ticket create (`tickets/route.ts:255`) and update (`tickets/[id]/route.ts:255`), `scheduleSlaCheck(orgId, ticketId, kind, dueAt)` enqueues a **delayed** job on `cron-tickets` with deterministic `jobId = sla:{kind}:{ticketId}` and `delay = dueAt - now + 30s` (`ticket-sla-scheduler.ts:56`). Re-scheduling replaces the prior delayed job (it `getJob`+`remove` first).
- Worker dispatches `SLA_JOB_NAMES.response|resolve` → `checkResponseSlaBreach`/`checkResolveSlaBreach` (`cron-tickets.ts:33-48`) — idempotent single-ticket version of the sweep, guarded by `responseBreachedAt`/`resolveBreachedAt`.
- `cancelSlaCheck` removes the delayed job when first response is recorded (`tickets/[id]/comments/route.ts:128`) or ticket closes.
- The **hourly sweep is the safety net** for any delayed job that was lost/missed.

**HTTP fallback** (`src/app/api/cron/tickets-auto-close/route.ts`, `.../tickets-sla-breach/route.ts`):
- `GET` guarded by `CRON_SECRET` (`x-cron-secret` header or Bearer), **fails CLOSED** if `CRON_SECRET` unset. Calls the same `runAutoCloseSweep`/`runSlaBreachSweep` directly — **no Redis needed**. Intended for Vercel Cron / manual re-run.

### Redis vs Postgres split
| Redis | Postgres |
|---|---|
| Repeatable schedule (cron pattern, next-run bookkeeping) | All ticket data, statuses, SLA timestamps, escalation level |
| Delayed per-ticket SLA jobs (`sla:{kind}:{ticketId}`) | `TicketActivity` audit rows, `Notification` rows |
| **Nothing about the ticket lives in Redis** | The breach/close decision is computed *from* Postgres and written *to* Postgres |

### TTL-expiry / removal behavior
- Repeatable jobs: `removeOnComplete:{count:100}`, `removeOnFail:{count:50}` (`schedulers.ts:69`). Delayed SLA jobs: `count:50` each.
- If a delayed SLA job is dropped, the **hourly sweep** still catches the breach (idempotent guards prevent double-processing). If the embedded worker never registered the cron (gap #1), the **HTTP fallback** route is the only recovery — Postgres is the source of truth either way.

### How the screen updates
SSE only for the resulting in-app notification (`publishNotification`/`publishTicketUpdate`). The ticket list/detail page refetches via React-Query; there is no live push of the status change beyond the notification toast.

### Degraded mode (no `REDIS_URL`)
- No queue → schedulers can't register and delayed jobs no-op. SLA/auto-close logic still runs **only** if the **HTTP cron routes** are hit by an external scheduler (they import the service directly and touch Postgres only).

---

## FEATURE 3 — Analytics refresh (compensation)

### Trigger
- Nightly scheduler `compensation-all-tenants` — `0 2 * * *` on the `analytics` queue (`worker/schedulers.ts:28`).
- Manual: `POST /api/v1/hrms/payroll/analytics/compensation/refresh` (enqueues `compensation-tenant`).

### Step-by-step flow
1. Scheduler fires `compensation-all-tenants` (Redis → worker, `worker/processors/analytics.ts:18`).
2. **Master fan-out**: `prisma.companySettings.findMany({ select:{orgId} })` derives active tenants (no Tenant model) — **Postgres read** (`analytics.ts:20`). For each, `enqueue("compensation-tenant", {orgId})` — **Redis writes** (child jobs).
3. **Per-tenant child** (`analytics.ts:38`) → `refreshCompensationAnalytics(orgId)` (`src/lib/services/analytics-cache.ts:118`):
   - `computeCompensationAnalytics` runs 5 heavy `$queryRaw` aggregations over `EmployeeSalary`/`Employee`/`Department`/`OfficeLocation` — **Postgres reads** (`analytics-cache.ts:38-115`).
   - `cacheSet("analytics:compensation:{orgId}", JSON, 36*3600)` — **Redis write**, key `analytics:compensation:{orgId}`, **TTL 36h** (`analytics-cache.ts:122`, `TTL_SEC` at line 11).
4. **Read path** — `GET /api/v1/hrms/payroll/analytics/compensation` (`src/app/api/v1/hrms/payroll/analytics/compensation/route.ts:9`):
   - Unless `?fresh=1`, `readCompensationAnalytics(orgId)` → `cacheGet("analytics:compensation:{orgId}")` — **Redis read** (`route.ts:15`).
   - **On hit** → return cached JSON.
   - **On miss / null / expiry** → `computeCompensationAnalytics(orgId)` runs the live SQL and returns it (`route.ts:22`). **It does NOT write back to cache** — only the worker writes the cache. So a miss recomputes every request until the next nightly/manual refresh populates Redis.

### Redis vs Postgres split
| Redis | Postgres |
|---|---|
| `analytics:compensation:{orgId}` → JSON snapshot (`CompensationAnalytics`), TTL 36h | `EmployeeSalary`, `Employee`, `Department`, `OfficeLocation` (the raw data) |
| Pre-computed, best-effort | Source of truth; live SQL recompute on miss |

### TTL-expiry / removal behavior
- 36h TTL deliberately **survives one missed nightly run** (`analytics-cache.ts:11`). On expiry the endpoint **recomputes live** from Postgres each call (no write-back). `?fresh=1` forces a live recompute bypassing cache. There is no `cacheDel` for analytics — it just expires.

### How the screen updates
Payroll page `Analytics` tab (`src/app/(dashboard)/hrms/payroll/page.tsx:98`) uses React-Query `compQ` against the compensation endpoint (enabled only when tab === "Analytics"). **Manual refetch / tab open** — no SSE. The screen shows whatever the endpoint returns (cache or live). There is **no UI button** wired to the `/refresh` POST endpoint (grep found no frontend caller) — refresh is API-only / nightly.

### Degraded mode (no `REDIS_URL`)
`cacheGet` returns null → endpoint **always computes live** every request (correct but expensive). The nightly worker can't run anyway. Functionally correct, just no caching.

---

## FEATURE 4 — Org-chart rebuild

### Trigger
`scheduleOrgChartRebuild(orgId, reason, userId)` (`src/lib/queue/helpers.ts:10`) enqueues `org-chart-rebuild` queue. Called from many write paths:
- Employee create / update / delete / restore: `employees/route.ts:279`, `employees/[id]/route.ts:221,275`, `employees/[id]/restore/route.ts:16`.
- Bulk delete / bulk-restore / bulk-hard-delete: `employees/bulk-{delete,restore,hard-delete}/route.ts`.
- Bulk import (worker): `worker/processors/bulk-employee-import.ts:62` (only when `!dryRun && success>0`).
- Manual: `POST /api/v1/hrms/org-chart/rebuild` (`org-chart/rebuild/route.ts:8`, returns 202 queued).
- Drag-to-reassign in the org chart UI calls `PATCH /employees/:id { reportingManagerId }` (`org-chart/page.tsx:216`) which hits the employee-update route → which schedules a rebuild (`reason:"employee.updated"`).

### Step-by-step flow
1. Write path calls `scheduleOrgChartRebuild` → `enqueue<OrgChartRebuildJobData>(ORG_CHART_REBUILD, "rebuild", {orgId, reason})` — **Redis write** (`helpers.ts:16`). Fire-and-forget (`void`, errors logged).
2. **Worker** (`worker/processors/org-chart-rebuild.ts:5`) → `refreshOrgChart(orgId)` (`src/lib/services/org-chart.ts:82`):
   - `computeOrgChart` = `prisma.employee.findMany({ where:{orgId, deletedAt:null}, select: …appRoles, department, designation })` — **Postgres read** (`org-chart.ts:37`).
   - `cacheSet("org-chart:{orgId}", JSON, 7*24*3600)` — **Redis write**, key `org-chart:{orgId}`, **TTL 7 days** (`org-chart.ts:84`, `TTL_SEC` line 12).
3. **Read path** — `GET /api/v1/hrms/org-chart` (`src/app/api/v1/hrms/org-chart/route.ts:6`):
   - Unless `?fresh=1`, `readOrgChart` → `cacheGet("org-chart:{orgId}")` — **Redis read**.
   - **Hit** → return snapshot. **Miss / expiry** → `computeOrgChart(orgId)` live (`route.ts:16`). Again **no write-back** on the read path — only the worker (`refreshOrgChart`) or `invalidateOrgChart` touch the cache.
4. `invalidateOrgChart(orgId)` = `cacheDel("org-chart:{orgId}")` exists (`org-chart.ts:93`) but grep found **no callers** — invalidation is done by re-enqueuing a rebuild, not by deleting the key.

### Redis vs Postgres split
| Redis | Postgres |
|---|---|
| `org-chart:{orgId}` → JSON `OrgChartSnapshot`, TTL 7d | `Employee` (+ `appRoles`, `Department`, `Designation`) — source of truth |
| Rebuild job on `org-chart-rebuild` queue | Reporting lines (`reportingManagerId`) |

### TTL-expiry / removal behavior
- 7-day TTL "covers stale window if a rebuild hook misses" (`org-chart.ts:12`). On expiry/miss, `GET /org-chart` recomputes live from Postgres (no write-back). So an employee change always reflects in the live recompute even if the rebuild job was lost; the cache just makes the common case fast.

### How the screen updates
`org-chart/page.tsx` (`useQuery(["org-chart-snapshot"], GET /org-chart)` at line 290). After a drag-reassign, the mutation `onSuccess` does `qc.invalidateQueries(["org-chart"])` (`page.tsx:217`) — **but the actual query key is `["org-chart-snapshot"]`**, so the invalidation key mismatches the data query.

### ⚠ Surprising gap #2 — stale org chart after reassign
- The reassign mutation invalidates `["org-chart"]` (`page.tsx:217`) but the org-chart data lives under `["org-chart-snapshot"]` (`page.tsx:291`). The bulk-delete mutation *does* invalidate `["org-chart-snapshot"]` correctly (`page.tsx:1014,1046`), but the drag-reassign path does not. Net effect: after a drag reassign, the PATCH succeeds and a rebuild is queued, but the on-screen chart is **not refetched** by that invalidation — it relies on the optimistic local state / a later refetch. Worth confirming against the rest of the file (lines >1199 not read), but the key mismatch is clear.
- Also note: the rebuild is async — even a correct refetch immediately after PATCH may read the **old cached snapshot** (7-day TTL) before the worker rebuilds it, unless the read used `?fresh=1` (the page does not). So the freshest data after a change comes from the next rebuild completing or a cache miss/expiry.

### Degraded mode (no `REDIS_URL`)
`scheduleOrgChartRebuild` no-ops; `cacheGet` returns null → `GET /org-chart` **always computes live** from Postgres. Correct, just uncached (heavier per request).

---

## Cross-cutting summary

- **Redis is never the source of truth** for any of these features. It holds: (a) transient job payloads (email, cron, rebuild, analytics fan-out), and (b) two best-effort cache snapshots (`analytics:compensation:{orgId}` 36h, `org-chart:{orgId}` 7d). Postgres holds every durable record.
- **Read endpoints always fall back to live Postgres compute on cache miss/expiry** — but **do not write back** (only the worker populates the cache). So without the worker running, reads are correct but uncached.
- **No literal "email button"** — email is a side-effect of Invite / Approve / recruit *Send* / cron actions. The reviewer's "email trigger button" maps to the **Invite** button (`POST /invitations`).
- **Two gaps worth raising**: (1) embedded worker doesn't `registerSchedulers()` → crons rely on the standalone worker or the `CRON_SECRET`-guarded HTTP routes; (2) org-chart drag-reassign invalidates the wrong React-Query key (`["org-chart"]` vs `["org-chart-snapshot"]`).
