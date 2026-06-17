# Flow A — BullMQ Background-Job Triggers (real code trace)

Traced from actual source on branch `gourav-uat-hrms`. Base dir: `apps/quikhrms`.

## Shared infrastructure (read this first)

- **Enqueue helper**: `src/lib/queue/queues.ts`
  - `enqueue(queueName, jobName, data, opts)` → `getQueue(name).add(jobName, data, opts)`, returns `job.id`.
  - **Degraded mode**: if `queueConnection` is `null` (no `REDIS_URL`, or `REDIS_DISABLED=true`), `enqueue()` logs `[queue] skipped enqueue ...` and **returns `""` — it no-ops, does NOT throw, does NOT run inline**. The triggering request still succeeds (e.g. the `DataImport`/`PayRun` row is created), but no worker ever picks it up, so status stays stuck at `ImportPending`/`queued` forever. There is **no inline fallback anywhere**.
  - `defaultJobOptions` (applied to every queue): `attempts: 3`, exponential backoff 5s, **`removeOnComplete: { age: 3600, count: 100 }`** (1h / last 100), **`removeOnFail: { age: 172800 }`** (2 days).
- **Redis connection**: `src/lib/queue/connection.ts` — BullMQ ioredis client; returns `null` when Redis is off (so importing the module never crashes a web route).
- **Queue names**: `src/lib/queue/types.ts` — `bulk-employee-import`, `bulk-bank-import`, `payroll-run`, `email`, `cron-tickets`, `pdf-generation`, `analytics`, `org-chart-rebuild`.
- **Worker registry**: `worker/processors/index.ts` — maps each queue → processor + concurrency.
- **Realtime / SSE**: publisher + subscriber in `src/lib/services/realtime.ts` (Redis Pub/Sub on channel `realtime:<orgId>`). SSE endpoint `src/app/api/v1/hrms/realtime/stream/route.ts` (GET, `event: <type>\ndata: <json>`). Client hook `src/lib/hooks/use-realtime.ts`, mounted app-wide via `RealtimeToastListener` + `ConnectionStatus` in `src/app/(dashboard)/hrms/layout.tsx:25-26`.
  - **Important**: the SSE pub/sub uses Redis **Pub/Sub**, which is separate from BullMQ. It is fire-and-forget (`.catch(() => {})`), carries no durable state, and has no TTL/fallback — if a client isn't connected at publish time, the event is lost. The durable status always lives in Postgres.

---

## 1. Bulk Employee Import — `bulk-employee-import` queue  ✅ real BullMQ

### Trigger
- Screen: `src/app/(dashboard)/hrms/employees/bulk-import/page.tsx`, "Import" / "Validate" button (`runImport()`, line ~854; button line ~1142).
- HTTP: `POST /api/v1/hrms/employees/bulk-import` with `{ fileName, rows, dryRun, markActive }`. Parsing (CSV/XLSX, column mapping, sub-sheets) happens **entirely client-side**; the server receives already-canonicalized `rows`.

### Step-by-step flow
1. **Frontend** — `importMut.mutate({...})` posts the canonical rows (mutation at `page.tsx:367-369`).
2. **API handler** — `src/app/api/v1/hrms/employees/bulk-import/route.ts`
   - L12: Zod `bulkImportEmployeesSchema.safeParse`.
   - **L17-26: DB write at enqueue time** — `prisma.dataImport.create({ entityType:"employees", fileName, totalRows, status:"ImportPending", createdBy })`.
   - **L28-40: Redis write** — `enqueue("bulk-employee-import", "process-import", { orgId, triggeredByUserId, importId, fileName, rows, dryRun, markActive })`. The **entire row payload travels through Redis** (`BulkEmployeeImportJobData`, `types.ts:27-33`). Job inherits default `removeOnComplete 1h / removeOnFail 2d`.
   - L42-46: returns `202 { importId, status:"queued", totalRows }`.
   - Rate-limited: 3 / 60s per tenant.
3. **Worker** — `worker/processors/bulk-employee-import.ts`
   - L20-23: `dataImport.updateMany → status "ImportProcessing"`.
   - L25: re-validates rows with `bulkEmployeeRowSchema`.
   - L28: `processBulkEmployees(...)` (service `src/lib/services/gap-fill.ts`) does the actual employee inserts.
   - **L30-44: result persisted to Postgres** — `dataImport.update` with `processedRows/successRows/failedRows/errors` and final `status` = `ImportCompleted` (0 failed) / `ImportFailed` (0 success) / `ImportPartial`.
   - L47-51: `publishBulkImportProgress(...)` → SSE `bulk_import_progress` (fire-and-forget).
   - L53-63: audit log; if `!dryRun && success>0` → `scheduleOrgChartRebuild` (enqueues `org-chart-rebuild`).
   - L67-73: if `!dryRun` → `inviteImportedEmployees` (creates invitations + queues activation emails).

### Redis vs Postgres
| Redis (BullMQ job, ephemeral) | Postgres (durable) |
|---|---|
| Job payload incl. **all rows**, dryRun, markActive | `DataImport` row (status, totalRows, processedRows, successRows, failedRows, errors JSON, fileName, createdBy) |
| Retry/backoff state | `Employee` rows created by the service |
| Auto-removed: complete 1h / fail 2d | Invitations + queued emails (side effects) |

### How the screen updates
**Client-side `setInterval` polling — NOT SSE, NOT React Query.** `page.tsx:386-419`: after enqueue, `onSuccess` sets `pendingImportId`; a `useEffect` polls `GET /api/v1/hrms/employees/bulk-import/{importId}` (route `bulk-import/[importId]/route.ts`, reads `DataImport` from Postgres) **every 2000ms** until status is terminal (`ImportCompleted|ImportFailed|ImportPartial`), then renders the result card. A blue progress banner shows total/processed/ok/failed (`page.tsx:1160-1188`).
- The SSE `bulk_import_progress` event (worker L47) invalidates query key `["employees","bulk-import"]` (`use-realtime.ts:62-66`), but **this page does not use React Query for the import status**, so SSE has **no effect** here — the `setInterval` poll is the only live-update path.
- Banner text "Safe to leave page — refresh to resume polling" is accurate: polling only resumes if you re-open with the same `pendingImportId` in state (lost on full reload — see gap below).

### When the Redis job is gone (after removeOnComplete/Fail)
No impact on the UI. All status is read from the **`DataImport` table in Postgres** via `GET /api/v1/hrms/employees/bulk-import/{importId}`. Redis only holds the in-flight job + retry state.

### Degraded mode (no REDIS_URL)
`DataImport` row is created with `status:"ImportPending"`, `enqueue()` no-ops, **no worker runs**. The page polls forever and never reaches a terminal state — it stays on "Import queued…". No inline fallback.

---

## 2. Bulk Bank Import — `bulk-bank-import` queue  ⚠️ NOT a background job (synchronous)

**Surprising finding: despite the prompt's assumption, this feature does NOT use BullMQ at all.** The `bulk-bank-import` queue name exists in `types.ts` and is registered in the worker as a **`noop` placeholder** (`worker/processors/index.ts:26`). **Nothing ever enqueues to it.** No Redis. No worker work. No `DataImport` row.

### Trigger
- Screen: `src/app/(dashboard)/hrms/employees/bulk-bank-import/page.tsx`, "Import" button (`runImport()` L131).
- HTTP: `POST /api/v1/hrms/employees/bulk-bank-import` with `{ rows }`.

### Step-by-step flow
1. **Frontend** — `importMut.mutate({ rows })` (`page.tsx:84-88`).
2. **API handler** — `src/app/api/v1/hrms/employees/bulk-bank-import/route.ts` — **does all work inline in the request**:
   - L24-26: Zod parse (`max 5000` rows).
   - L31-35: load matching `Employee` rows by `employeeCode`.
   - L40-65: **loop, one `prisma.employee.update` per row** setting `bankAccounts: [bankAccount]` (overwrites existing). Collects per-row errors.
   - L67-70: single audit log.
   - L72: returns `200 { total, updated, failed, errors }` synchronously.

### Redis vs Postgres
| Redis | Postgres |
|---|---|
| **Nothing** | `Employee.bankAccounts` updated in place; one `AuditLog` row |

### How the screen updates
Synchronous response → `onSuccess: setResult(res.data)` renders the result card immediately (`page.tsx:87`). No polling, no SSE, no refresh needed. Button shows "Importing…" while the single request is in flight.

### When the Redis job is gone
N/A — nothing is ever written to Redis.

### Degraded mode (no REDIS_URL)
**Fully unaffected** — it never touches Redis. Works regardless of Redis state. (This is the one feature that is robust to Redis being down, precisely because it's synchronous.)

> Gap flagged: large bank imports (up to 5000 rows × 1 UPDATE each) run inline in a single HTTP request and can time out. The queue scaffolding exists but was never wired.

---

## 3. Payroll Run (compute) — `payroll-run` queue  ✅ real BullMQ; job-STATE in Postgres

### Trigger
- Screen: `src/app/(dashboard)/hrms/payroll/runs/[id]/page.tsx`, "Compute Payslips" / "Recompute" button (`computeMut.mutate()`, button line ~254).
- HTTP: `POST /api/v1/hrms/payroll/runs/{id}/compute`.

### Step-by-step flow
1. **Frontend** — `computeMut` posts to the compute endpoint (`page.tsx:163-168`).
2. **API handler** — `src/app/api/v1/hrms/payroll/runs/[id]/compute/route.ts`
   - L14-18: load `PayRun`, must be `Draft`/`Processing`.
   - L20-23: **dedupe guard** — `getPayrollComputeState`; if already `queued`/`running` → `409 conflict`.
   - **L25-32: DB write at enqueue time** — `setPayrollComputeState(orgId, id, { status:"queued" })`, which writes to the **`PayRun.compute*` columns in Postgres** (NOT Redis) — see `src/lib/services/payroll-compute-state.ts` (`computeStatus`, `computeStartedAt`, `computeFinishedAt`, `computeEmployeeCount`, `computeTotalGross/Net/Deductions`, `computeError`). State was folded out of a separate table into `PayRun`.
   - **L34-38: Redis write** — `enqueue("payroll-run", "compute", { orgId, triggeredByUserId, runId })`. **Payload is just `runId`** (`PayrollRunComputeJobData`, `types.ts:35-37`) — no payslip data in Redis.
   - L40: returns `202 { runId, status:"queued" }`.
3. **Worker** — `worker/processors/payroll-run.ts`
   - L19: rejects any job name ≠ `"compute"`.
   - L23-27: reload `PayRun`, re-check status.
   - L29-34: `setPayrollComputeState → "running"` (Postgres).
   - L37: `publishPayrollProgress(... status:"processing")` (SSE, fire-and-forget).
   - L40-41: `computePayslipsForRun` + `persistComputedPayslips` → **writes `Payslip` + `PayslipLine` rows to Postgres**.
   - L43-63: audit log + `emitPayrollEvent(RUN_PROCESSED)`.
   - L65-72: `setPayrollComputeState → "done"` with totals (Postgres).
   - L75-79: `publishPayrollProgress(... status:"done")` (SSE).
   - L86-98 (catch): `setPayrollComputeState → "failed"` with `error` (Postgres) + SSE `failed`; rethrows so BullMQ marks the job failed/retries.

### Redis vs Postgres
| Redis | Postgres |
|---|---|
| BullMQ job (payload = `runId` only) + retry state | **`PayRun.compute*` columns = the authoritative job state** (queued/running/done/failed, started/finished, totals, error) |
| Pub/Sub `payroll_progress` events (ephemeral) | `Payslip` + `PayslipLine` rows (the actual computed result) |
| Auto-removed: complete 1h / fail 2d | `AuditLog`, `PayRun.status` |

> Confirmed as the prompt expected: **payroll job-state is in Postgres on `PayRun.compute*`, not Redis.** Redis only holds the BullMQ job (just the runId) and transient SSE pings.

### How the screen updates
**React Query polling + SSE assist** (`page.tsx:128-161`):
- A `useQuery(["payroll","runs",id,"compute-status"])` hits `GET .../compute/status` (route reads `PayRun.compute*` from Postgres). **`refetchInterval` = 2000ms while status is `queued|running`, else `false`** (stops polling at terminal state).
- When `compute.status` becomes `done|failed`, a `useEffect` invalidates `["payroll","runs",id]` to **refetch the run + pull the new payslips** (L156-161).
- SSE adds a second nudge: `payroll_progress` events invalidate query key `["payroll"]` (`use-realtime.ts:56-60`), so a connected client refreshes even between poll ticks. Either path works; the poll is the guaranteed one.
- UI shows "Queued…/Computing…" button states and a status banner with error/startedAt (L318-336).

### When the Redis job is gone
No UI impact. Compute state is read from **`PayRun.compute*` (Postgres)** via `GET .../compute/status`; payslips from the `PayRun`/`Payslip` tables. Redis losing the job only removes retry ability.

### Degraded mode (no REDIS_URL)
`setPayrollComputeState → "queued"` is written to Postgres, `enqueue()` no-ops, **no worker computes**. The status endpoint returns `queued` forever, the page polls indefinitely, no payslips are produced. No inline fallback. (And because the `409` dedupe guard sees a stuck `queued` state, a retry is blocked until `clearPayrollComputeState` is called.)

---

## 4. PDF generation — `pdf-generation` queue  ✅ real BullMQ (payslip-release only)

**Finding: the `pdf-generation` queue is used ONLY for payslip release. Form 16 PDFs are generated synchronously in the request and never touch this queue** (see note at bottom).

### Trigger
- Screen: `src/app/(dashboard)/hrms/payroll/runs/[id]/page.tsx`, "Release Payslips" button (visible when `run.status === "Approved"`, line ~276-283) → `handleRelease()` → confirm modal → `releaseMut.mutate()`.
- HTTP: `POST /api/v1/hrms/payroll/runs/{id}/release`.
- Secondary trigger: per-payslip resend — `POST .../runs/[id]/payslips/[payslipId]/resend-email` also enqueues `pdf-generation/payslip-release` (`resend-email/route.ts:35`).

### Step-by-step flow
1. **Frontend** — `releaseMut` posts to the release endpoint (`page.tsx:173-176`).
2. **API handler** — `src/app/api/v1/hrms/payroll/runs/[id]/release/route.ts`
   - L17-20: `assertTransition(status → "Paid")`.
   - **L24-78: `$transaction` (all Postgres writes at request time)** — process loan deductions (`LoanRepayment` create, `EmployeeLoan` update), `payslip.updateMany → status:"Released", releasedAt`, `payRun.update → status:"Paid"`, then collect released payslip ids.
   - L80-85: audit + `emitPayrollEvent(RUN_RELEASED)`.
   - **L89-98: Redis writes — one job per payslip** — `enqueue("pdf-generation", "payslip-release", { orgId, triggeredByUserId, payslipId, payRunId })` (`PayslipReleaseJobData`, `types.ts:57-60`). PDF is **NOT built here** — only ids go to Redis.
   - L103: `refreshLiabilityForPayRun` (TDS, errors swallowed).
   - L107: returns `200 { id, status:"Paid", queuedPayslips }`.
3. **Worker** — `worker/processors/pdf-generation.ts` (job-name dispatcher; `payslip-release` is the only handled case, L13; unknown names throw, L37).
   - Calls `buildAndQueuePayslipEmail(...)` → `src/lib/services/payslip-release.ts`:
     - loads payslip+lines, run, company, employee (Postgres);
     - **builds the payslip PDF in the worker** (`buildPayslipPdf`, L104);
     - `queueEmail(...)` → enqueues an `email` job with the PDF as a base64 attachment (L137-149) → emitted as `PAYSLIP_EMAIL_SENT`;
     - returns `{ queued:false, reason }` for skip cases (no email / not found) — logged, not a job error.

### Redis vs Postgres
| Redis | Postgres |
|---|---|
| `pdf-generation` job per payslip (payload = ids only) | `Payslip.status="Released"`, `releasedAt`; `PayRun.status="Paid"` |
| `email` job carrying the **generated PDF bytes** (base64 attachment) — transient | `LoanRepayment`, `EmployeeLoan` updates; `AuditLog`; TDS liability |
| Auto-removed: complete 1h / fail 2d | (the PDF itself is **never persisted** — it lives only as the email attachment) |

### How the screen updates
**No live tracking of PDF/email jobs.** On release success, `releaseMut.onSuccess` invalidates `["payroll","runs",id]` once (`page.tsx:175`); the run flips to `Paid` and payslips show `Released`. The downstream PDF-build + email jobs run fully in the background with **no UI feedback** — the screen does not poll or show per-payslip email status. `PAYSLIP_EMAIL_SENT/FAILED` are emitted as internal payroll events (not the SSE `payroll_progress` type), so the release screen does **not** surface them. **User must trust it / check email logs; flagged as a gap.**

### When the Redis job is gone
The release outcome is durable in Postgres (`Payslip.status`, `releasedAt`, `PayRun.status="Paid"`). But the **PDF is only ever an email attachment — it's never stored**, so once the `pdf-generation` + `email` jobs are gone there is no PDF to re-read; re-sending requires the `resend-email` endpoint, which **rebuilds the PDF from scratch** off Postgres data.

### Degraded mode (no REDIS_URL)
The release `$transaction` commits (run → Paid, payslips → Released) because it's inline, but `enqueue()` no-ops → **no PDFs built, no emails sent**. The UI still shows success. No inline fallback. Silent: employees simply never receive payslip emails.

---

## Cross-feature summary

| Feature | Real queue? | State of record | Live update mechanism | Redis-down behavior |
|---|---|---|---|---|
| Bulk employee import | ✅ `bulk-employee-import` | `DataImport` (Postgres) | `setInterval` poll 2s (own fetch, not RQ/SSE) | enqueue no-op → stuck `ImportPending` |
| Bulk bank import | ❌ none (noop placeholder) | `Employee.bankAccounts` (Postgres) | synchronous response | unaffected (never uses Redis) |
| Payroll compute | ✅ `payroll-run` | `PayRun.compute*` cols (Postgres) | RQ `refetchInterval` 2s + SSE assist | enqueue no-op → stuck `queued`, dedupe blocks retry |
| Payslip release / PDF | ✅ `pdf-generation` → `email` | `Payslip`/`PayRun` status (Postgres); PDF never persisted | none (one-shot invalidate; no job tracking) | enqueue no-op → no PDFs/emails, UI still "Paid" |

## Flagged gaps / surprises
1. **Bulk bank import is synchronous**, not a BullMQ job. The `bulk-bank-import` queue is a registered **no-op** with nothing enqueuing to it (`worker/processors/index.ts:26`).
2. **Form 16 PDFs are synchronous** (`form16/pdf/route.ts`, `form16/bulk-pdf/route.ts` call `buildPdf` inline and stream the bytes; never persisted, never queued). The `pdf-generation` queue handles **only** `payslip-release`.
3. **Bulk-import page uses raw `setInterval` polling**, not React Query and not the SSE stream — the `bulk_import_progress` SSE event it could consume has no effect on that page. Full page reload loses `pendingImportId`, so polling does not actually "resume" on refresh despite the banner copy.
4. **No inline fallback anywhere** when Redis is down — `enqueue()` silently returns `""`. Employee-import and payroll-compute both get permanently stuck in their pending/queued status; payslip release silently sends no emails.
5. **Payslip PDF is never stored** — it exists only as an email attachment inside a transient `email` job, so it vanishes with the job (1h after completion). Re-obtaining it requires `resend-email`, which regenerates from Postgres.
6. **Payroll dedupe trap**: a stuck `queued` state (Redis down) makes the compute endpoint return `409`, blocking retries until `clearPayrollComputeState` is run.
