# QuikInfra — Deployment & Operations Guide

Production-ready Next.js 14 Construction ERP. Multi-tenant, RBAC-gated,
ledger-hardened, with a full test suite and structured observability.

## Stabilization pass — what's in this build

This build contains the UAT stabilization fixes for all 7 validated
production blockers. Full manual test plan in
[tests/UAT_TEST_PLAN.md](tests/UAT_TEST_PLAN.md).

| # | Issue | Status | Where |
|---|---|---|---|
| 1 | BOQ Upload Revision (sheet detection + 2-step preview/confirm) | ✓ Fixed | [`app/api/projects/[projectId]/boq/preview-upload/route.ts`](app/api/projects/[projectId]/boq/preview-upload/route.ts) + [`app/(dashboard)/projects/boq/BOQImportDrawer.tsx`](app/(dashboard)/projects/boq/BOQImportDrawer.tsx) |
| 2 | Project form state/city binding | Already working | Form has 22-state dropdown, city is free-text with edit-mode backfill via `useEffect` in [`ProjectFormDrawer.tsx`](app/(dashboard)/masters/projects/ProjectFormDrawer.tsx) |
| 3 | Searchable material selector in MR lines | ✓ Fixed | New [`src/components/SearchSelect.tsx`](src/components/SearchSelect.tsx) + wired into [`PRCreateDrawer.tsx`](app/(dashboard)/purchase/requisitions/PRCreateDrawer.tsx) |
| 4 | Line-item state reset when material changes / clears | ✓ Fixed | `updateLine()` in PRCreateDrawer now wipes dependent fields (UOM, stock, rate) on itemId change or clear; line isolation preserved via per-row spread copy |
| 5 | PR → MR terminology | ✓ Fixed | Sidebar label, drawer title, detail page title, breadcrumbs, create button all say "Material Requisition" / "MR" |
| 6 | Approval workflow end-to-end | ✓ Fixed | New [`ApprovalActionBar.tsx`](src/components/ApprovalActionBar.tsx) + reusable [`handleApprovalAction`](src/lib/workflow/handle-approval.ts) + 6 new approve routes (MR, Indent L1/L2/L3, PO L1/L2, Issue, Transfer, Recon) + [`/approvals` inbox](app/(dashboard)/approvals/page.tsx) backed by [`/api/approvals/inbox`](app/api/approvals/inbox/route.ts) |
| 7 | RBAC sidebar + server enforcement | ✓ Fixed | Sidebar items carry `requiredPermission`, filtered via `usePermissions().can()` in [`QuikInfraShell.tsx`](src/components/QuikInfraShell.tsx); server routes already gated via `requirePermission()` from Phase 1+ |

### Files added this pass

```
src/components/
  SearchSelect.tsx             — reusable searchable combobox (keyboard-accessible, debounced)
  ApprovalActionBar.tsx        — approve/reject/return buttons with comment modal + permission gate

src/lib/workflow/
  handle-approval.ts           — shared approval action handler for globalThis-backed entities

app/api/
  approvals/inbox/route.ts                          — returns pending items filtered by caller perms
  purchase/requisitions/[id]/approve/route.ts       — MR approve (single stage)
  purchase/indents/[id]/approve/route.ts            — Indent 3-stage L1/L2/L3
  purchase/orders/[id]/approve/route.ts             — PO 2-stage L1/L2
  store/issue/[id]/approve/route.ts                 — Material issue approve (deducts stock)
  store/transfer/[id]/approve/route.ts              — Stock transfer approve
  store/reconciliation/[id]/approve/route.ts        — Stock reconciliation approve
  projects/[projectId]/boq/preview-upload/route.ts  — SheetJS-backed multipart upload + workbook preview

app/(dashboard)/
  approvals/page.tsx                                — inbox page grouped by entity type
  projects/boq/BOQImportDrawer.tsx                  — 3-step upload/preview/confirm drawer

tests/
  UAT_TEST_PLAN.md                                  — 30+ manual test cases covering all 7 fixes
```

### Files modified this pass

```
src/components/QuikInfraShell.tsx
    — permission-aware nav filter via usePermissions().can()
    — new `requiredPermission` field on nav items
    — displays current role under user footer

src/lib/observability/logger.ts
    — replaced indirect Function("m","require(m)") trick with a typed
      lazy require (the trick broke in Next's RSC server runtime)

app/(dashboard)/purchase/requisitions/PRCreateDrawer.tsx
    — replaced native <select> for Material with <SearchSelect>
    — rewrote updateLine() to wipe dependent fields on itemId change/clear
    — "Create Purchase Requisition" → "Create Material Requisition"
    — "Create PR (Draft)" → "Create MR (Draft)"

app/(dashboard)/purchase/requisitions/[id]/page.tsx
    — added <ApprovalActionBar> in the header
    — breadcrumb label "Requisitions" → "Material Requisitions"
    — subtitle "Purchase Requisition" → "Material Requisition"

app/(dashboard)/purchase/orders/[id]/page.tsx
    — added <ApprovalActionBar> for PO L1/L2

app/(dashboard)/purchase/grn/[id]/page.tsx
    — added <ApprovalActionBar> for GRN approve

app/(dashboard)/projects/boq/page.tsx
    — replaced broken QuickCreateDrawer import wiring with <BOQImportDrawer>

app/(dashboard)/approvals/page.tsx
    — rewritten as a real inbox that polls /api/approvals/inbox every 30s

package.json
    — added xlsx dependency for server-side BOQ workbook parsing
```

## Demo login credentials

Password for all 5 seeded accounts: **`12345`**

| Email | UI role | RBAC role key | Department | Permissions |
|---|---|---|---|---|
| `amit@quikinfra.com`   | SUPER ADMIN  | `platform_super_admin` | Engineering | 75 (all) |
| `priya@quikinfra.com`  | ADMIN        | `tenant_admin`         | Procurement | 75 (all within tenant) |
| `rajesh@quikinfra.com` | HO USER      | `accounts_finance`     | Finance     | 19 (RAB approve, finance ops, read-only BOQ) |
| `sanjay@quikinfra.com` | SITE ADMIN   | `site_engineer`        | QA          | 18 (DPR write, MR create, GRN write) |
| `rakesh@quikinfra.com` | USER         | `store_head`           | Store       | 23 (GRN approve, Issue approve, transfers) |

Records are in `demo_users`, seeded by [`prisma/seed.ts`](prisma/seed.ts).
Passwords are stored as scrypt hashes (`<salt>:<key>`, 16-byte salt, 64-byte key)
via [`src/lib/auth/password.ts`](src/lib/auth/password.ts) — Node built-in,
no bcrypt dependency.

To re-seed with a different password:
```bash
DEMO_PASSWORD="your-new-password" pnpm exec prisma db seed
```

**Never use `12345` on a production system.** The env validator doesn't
block weak user passwords (it only checks `NEXTAUTH_SECRET` length) — leaving
demo credentials enabled on a production deploy is a go-live blocker in §11.

This document is the single source of truth for:
- Local development setup
- Production deployment
- Environment configuration
- Observability (logs, metrics, errors, request tracing)
- Backup and restore
- Go-live checklist

---

## 1. Quick start — local dev

```bash
cd apps/quikinfra
pnpm install                      # installs the app's deps + regenerates Prisma client
pnpm run dev -- -p 3010           # starts Next.js on port 3010
```

First boot also needs a Postgres and a seeded database:

```bash
# Start Postgres (any method — local install, Docker, compose)
# Then point .env at it:
#   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/quikinfra?schema=public"

pnpm exec prisma db push           # create tables
pnpm exec prisma db seed           # 75 permissions + 12 roles + reference data
```

Access the app at `http://localhost:3010`. In dev mode (`AUTH_DEMO_MODE=true`)
every request resolves to a pre-seeded super-admin context — no login flow
needed. For production see §4.

---

## 2. Environment variables

Every variable is listed in [`.env.example`](.env.example) with inline
comments. They are validated at boot through
[`src/lib/config/env.ts`](src/lib/config/env.ts) using a Zod schema:

- **Development:** missing optional vars default sensibly. Validation
  warns but the app boots.
- **Production:** validation is strict. The process exits with a clear
  error if any of the following is wrong:
  - `NEXTAUTH_SECRET` missing or under 16 chars
  - `DATABASE_URL` missing or not a URL
  - `AUTH_DEMO_MODE` is anything other than `"false"`
  - AWS S3 credentials missing (region / access key / secret / bucket)

**Required in production:**
```
NODE_ENV=production
APP_ENV=production
APP_RELEASE=<git-sha-or-semver>
NEXTAUTH_SECRET=<32-byte-random>
NEXTAUTH_URL=https://app.example.com
AUTH_DEMO_MODE=false
DATABASE_URL=postgresql://...
STORAGE_BUCKET=...
# AWS S3 creds — STORAGE_S3_* (or the shared AWS_* aliases):
#   STORAGE_S3_REGION / AWS_REGION
#   STORAGE_S3_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
#   STORAGE_S3_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
```

**Strongly recommended in production:**
```
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
LOG_LEVEL=info
```

### Staging vs production separation

Use two fully separate instances:

| Concern | Staging | Production |
|---|---|---|
| `NODE_ENV` | `production` | `production` |
| `APP_ENV` | `staging` | `production` |
| Database | separate Postgres + separate credentials | separate Postgres + separate credentials |
| Object bucket | separate bucket (e.g. `quikinfra-staging`) | `quikinfra-prod` |
| Domain | `staging.app.example.com` | `app.example.com` |
| `SENTRY_ENVIRONMENT` | `staging` | `production` |
| `NEXTAUTH_SECRET` | different random value | different random value |
| Seed data | full demo data for QA | only reference data (UOMs, GST codes, roles) — no demo projects |

Never share a database, bucket, or NextAuth secret between staging and
production. "Just a bit of cross-pollination" is how staging DPRs end up
in a real customer's audit log.

---

## 3. Secrets handling

- **Never commit `.env.production`.** `.gitignore` already excludes it;
  double-check before every merge.
- **Never put secrets in `docker-compose.yml` or a Kubernetes ConfigMap.**
  Use a Secret (Kubernetes), SOPS-encrypted file, or a secret manager
  (AWS Secrets Manager, Doppler, 1Password Connect, HashiCorp Vault).
- **Rotate `NEXTAUTH_SECRET` on any suspected compromise.** All existing
  sessions become invalid — users are forced to re-login. Acceptable.
- **Rotate DB credentials quarterly or on team changes.** Prisma picks
  up the new `DATABASE_URL` on the next deploy.
- **S3/R2 credentials should be a dedicated IAM user** scoped to
  `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:HeadObject`,
  `s3:ListBucket` on a single bucket with a `tenants/*` prefix policy.
- **Idempotency key TTL is 24 hours by default** — rows in
  `idempotency_keys` are not secrets, but a misconfigured retention
  could expose past request bodies. A nightly prune job is documented
  under §8.

---

## 4. Deploying

The app is a standard Next.js 14 server. Build once, run anywhere.

### Build

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate           # must run before `next build`
pnpm run build
```

`pnpm run build` type-checks, bundles, and writes to `.next/`. If any
required env var is missing at build time, the `loadEnv()` call in
`src/lib/db/prisma.ts` throws — the build fails loudly, not silently.

### Run

```bash
pnpm run start                      # or: npx next start -p 3010 -H 0.0.0.0
```

`next start` requires `NODE_ENV=production`. Set it in the process env
(Docker ENV, systemd `Environment=`, Kubernetes `env:`), NOT in `.env`.

### Docker

A minimal production Dockerfile:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN pnpm exec prisma generate && pnpm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3010
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
EXPOSE 3010
CMD ["pnpm", "run", "start"]
```

Run it:

```bash
docker run -p 3010:3010 --env-file .env.production quikinfra:latest
```

### Kubernetes probes

```yaml
livenessProbe:
  httpGet: { path: /api/health, port: 3010 }
  initialDelaySeconds: 20
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet: { path: /api/ready, port: 3010 }
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
  successThreshold: 1
```

- `/api/health` is a **liveness** probe. Returns 200 as long as the Node
  process is alive and responsive. Does NOT touch the database. Failing
  means "restart the container".
- `/api/ready` is a **readiness** probe. Returns 200 only when the DB is
  reachable, the schema is applied (counts rows in `roles`), and env
  validation passed. Returns 503 with a structured `checks` object
  otherwise. Failing means "take this pod out of rotation but don't kill
  it yet".

---

## 5. Observability

### Request IDs / correlation IDs

Every request gets an `x-request-id` header, generated by
[`middleware.ts`](middleware.ts). The same id flows through:

- Request → response headers (echoed back to the client)
- Structured log lines (`requestId` field)
- Audit log rows (joined via the logger)
- Sentry events (if configured)

If an upstream (load balancer, browser interceptor, external service)
sends `x-request-id` or `x-correlation-id`, the middleware honors it.
Otherwise a fresh `req_<22-char-random>` is generated.

### Structured logging

[`src/lib/observability/logger.ts`](src/lib/observability/logger.ts)
emits JSON-lines (one object per line). No format config needed — pipe
stdout/stderr to Datadog, Loki, CloudWatch, Elastic, whatever.

Every line has:
```json
{"ts":"2026-04-12T12:30:45.123Z","level":"info","msg":"boq_imported","requestId":"req_...","tenantId":"default","projectId":"proj-1","rowCount":47}
```

Log levels are filtered by `LOG_LEVEL` (default `info`). Set `debug` in
staging for noisy detail; keep `info` in production.

### Error tracking (Sentry)

Optional. When `SENTRY_DSN` is set AND `@sentry/nextjs` is installed,
the [Sentry shim](src/lib/observability/sentry.ts) auto-inits on first
import and forwards every `logger.error({ err })` and every unknown
exception in `toHttpResponse()`.

Not installed by default because the SDK is heavy and the app works
without it. To enable:

```bash
pnpm add @sentry/nextjs
# set SENTRY_DSN in the deploy env, restart
```

The shim uses indirect `Function("m", "return require(m)")` so the
webpack bundler can't see the import — builds succeed without the
package installed.

### Metrics

Not included in this phase. Hooks to add later:
- Prometheus `/metrics` endpoint via `prom-client`
- Histogram on every route handler (bucket by route + status)
- Counter on rate-limit blocks and audit log writes

---

## 6. Rate limiting

Built-in, in-memory, per-node. See
[`src/lib/workflow/rate-limit.ts`](src/lib/workflow/rate-limit.ts).

Currently applied to:
- **BOQ import** — 5 per minute per user
- **DPR approve** — 30 per minute per user
- **RAB approve** — 30 per minute per user

To add more:
```ts
import { rateLimit, LIMITS } from "@/lib/workflow/rate-limit";

const limited = await rateLimit({ ...LIMITS.LOGIN, req, identifier: ip });
if (limited.blocked) return limited.response!;
```

**Production caveat:** in-memory limits are per-node. Behind N replicas,
the effective rate is N × `limit`. For strict global limits, swap the
`store` in `rate-limit.ts` for a Redis-backed implementation — the
interface is tiny (get/set/incr with TTL).

---

## 7. Database migrations

Use `prisma migrate deploy` in production. NEVER use `prisma migrate dev`
or `prisma db push` against a real database — they can drop data.

### Safe migration procedure

1. **Write the migration in a PR.** `pnpm exec prisma migrate dev --name
   your_change` against your local DB generates `prisma/migrations/NNN/`.
2. **Review the generated SQL.** Pay attention to `DROP COLUMN`, `ALTER
   COLUMN TYPE`, `ADD COLUMN NOT NULL`, and any operation that takes a
   lock longer than a few ms. Consult the `migration-planner` skill
   before merging breaking changes.
3. **Apply to staging first.** Run `prisma migrate deploy` against the
   staging DB. Watch the logs for long-running statements.
4. **Verify staging is still green** — run the full E2E suite against
   staging.
5. **Backup production.** (§8)
6. **Apply to production.** `prisma migrate deploy`. Monitor
   `/api/ready` for 5xx during the rollout.
7. **If it goes wrong**, restore from the backup taken in step 5. A
   migration that's already been half-applied is hard to roll back
   in-place — restore is usually faster.

### Migration safety rules

- Never drop a column the app still reads.
- Never add a `NOT NULL` column without a `DEFAULT` or a two-step
  (add nullable → backfill → set NOT NULL).
- Never rename a column — drop the old one only after every caller is
  reading the new one.
- Test every migration against a copy of production data in staging.

---

## 8. Backup and restore

### What to back up

| Item | Frequency | Retention | Method |
|---|---|---|---|
| Postgres database | hourly (WAL) + daily full | 30 days hot, 1 year cold | `pg_dump` or managed snapshot |
| Object storage bucket | versioning enabled (native) | 90 days | S3 versioning + lifecycle rule |
| `.env.production` | on change | forever | secret manager (encrypted) |
| Audit log rows | never delete | forever | part of the DB backup |
| Idempotency keys | expire after 24h | N/A | part of the DB backup, not critical |

### Postgres backup

Daily full dump via cron:

```bash
# /etc/cron.daily/quikinfra-backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  --file="/backups/quikinfra-${TIMESTAMP}.dump"

# Retention: keep 30 days locally, sync older to S3 Glacier
find /backups -name 'quikinfra-*.dump' -mtime +30 -delete
aws s3 sync /backups s3://qk-backups/postgres/ --storage-class GLACIER
```

**Managed Postgres (RDS, Cloud SQL, Neon, Supabase):** enable automated
snapshots in the console. Set retention to ≥ 30 days. Point-in-time
recovery gives you per-minute granularity during an incident.

### Restore drill

Practice restore quarterly. The first time you need a real restore is
the wrong time to learn the tool.

```bash
# Restore to a throwaway DB
createdb quikinfra_restore
pg_restore \
  --dbname=postgresql://postgres:***@localhost:5432/quikinfra_restore \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  /backups/quikinfra-YYYYMMDD-HHMMSS.dump

# Sanity checks
psql quikinfra_restore -c "SELECT COUNT(*) FROM projects"
psql quikinfra_restore -c "SELECT COUNT(*) FROM boq_items_v2"
psql quikinfra_restore -c "SELECT COUNT(*) FROM audit_logs WHERE timestamp > NOW() - INTERVAL '1 day'"
```

Document the actual restore time in the runbook. If it's longer than
your SLA, either shrink the DB (partition old audit rows), use a
warm standby, or move to point-in-time recovery.

### Idempotency cache pruning

`idempotency_keys` rows expire after 24 hours (client keys) or 10
minutes (auto-keys). The app does NOT auto-delete expired rows — add a
nightly job:

```bash
# Cron or Kubernetes CronJob
psql "$DATABASE_URL" -c "DELETE FROM idempotency_keys WHERE expires_at < NOW()"
```

Without pruning the table grows forever. A 6-month-old idempotency cache
can reach millions of rows and slow the `findUnique` at the top of every
mutation.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App boots but every request is 500 | `DATABASE_URL` points to wrong DB | Check `/api/ready` output — it says which check failed |
| `/api/ready` returns 503 `roles is empty` | Seed not applied | `pnpm exec prisma db seed` |
| `/api/ready` returns 503 `roles table missing` | Migration not applied | `pnpm exec prisma migrate deploy` |
| 403 on every protected route | `AUTH_DEMO_MODE=false` but NextAuth session isn't wired | Set up real NextAuth provider OR set `AUTH_DEMO_MODE=true` in dev |
| 429 Too Many Requests on import | Rate limit (5/min/user) | Wait + retry, or set `RATE_LIMIT_DISABLED=true` during data migration |
| Idempotent-Replay header returns stale data | Old cache row | `DELETE FROM idempotency_keys WHERE route = 'X'` |
| Build fails `Module not found: @prisma/client` | `prisma generate` not run | `pnpm exec prisma generate --schema=./prisma/schema.prisma` |
| Prisma client is missing `cnBOQProgressLedger` | Workspace collision — see §10 below | Confirm `generator client` block has `output = "../node_modules/.prisma-qc/client"` |

---

## 10. Known gotchas

### pnpm workspace Prisma client collision

Multiple apps in this pnpm workspace have their own `schema.prisma`. By
default they all generate into a single shared location
(`node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client`) and
the last to run wins — which silently strips models from whichever apps
didn't generate last.

Fix (already applied): the generator block in
[`prisma/schema.prisma`](prisma/schema.prisma) has
`output = "../node_modules/.prisma-qc/client"`. Import the generated
client from `src/lib/db/prisma.ts` via the custom path, NOT via
`@prisma/client`.

---

## 11. Go-live checklist

Run through every item before flipping the DNS. Items marked **[blocker]**
must be green; everything else is strongly recommended but won't block
boot.

### Config

- [ ] **[blocker]** `NODE_ENV=production` in the deploy env
- [ ] **[blocker]** `AUTH_DEMO_MODE=false` in the deploy env
- [ ] **[blocker]** `NEXTAUTH_SECRET` set to a ≥32-byte random value (not the dev default)
- [ ] **[blocker]** `DATABASE_URL` points to the production DB (not staging, not dev)
- [ ] **[blocker]** AWS S3 credentials + `STORAGE_BUCKET` set (`STORAGE_S3_*` or `AWS_*`)
- [ ] `APP_RELEASE` set to the git SHA or semver tag (shows up in logs + Sentry)
- [ ] `SENTRY_DSN` set (if using Sentry)
- [ ] `.env.production` is NOT in git
- [ ] `LOG_LEVEL=info` in production

### Database

- [ ] **[blocker]** Postgres 15+ reachable from the app
- [ ] **[blocker]** Migrations applied (`prisma migrate deploy`)
- [ ] **[blocker]** Seed run (12 roles + 75 permissions present)
- [ ] **[blocker]** Daily backup cron configured
- [ ] **[blocker]** Restore drill performed on a copy of production data at least once
- [ ] Idempotency cache pruning cron configured
- [ ] DB user is NOT `postgres` superuser — a scoped role with `CONNECT`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `USAGE` on the app schema only
- [ ] Connection pool sizing reviewed (Prisma default 10 connections × N nodes ≤ max_connections)

### Storage

- [ ] **[blocker]** S3/R2 bucket exists + versioning enabled
- [ ] **[blocker]** Lifecycle rule for soft-deleted objects (e.g. expire after 90 days)
- [ ] IAM user scoped to ONE bucket with ONE prefix (`tenants/*`)
- [ ] Bucket is in the same region as the app for latency
- [ ] CORS configured if the browser uploads directly (presigned URLs) — allow the app's origin only

### Security

- [ ] **[blocker]** HTTPS terminated at the LB — never serve the app over plain HTTP in production
- [ ] **[blocker]** Security headers configured (Strict-Transport-Security, X-Content-Type-Options, Content-Security-Policy)
- [ ] **[blocker]** `idempotency_keys` and `audit_logs` tables have read restrictions (tenant admin only)
- [ ] Rate limits tested under load — 5/min imports, 30/min approvals
- [ ] `RATE_LIMIT_DISABLED` is NOT set
- [ ] Stale idempotency keys cleaned before go-live (`DELETE FROM idempotency_keys`)
- [ ] All 12 seed roles have at least one real user mapped (no tenant locked out of its own data)
- [ ] Real NextAuth provider configured (email + password, OIDC, SSO) — demo mode is OFF

### Observability

- [ ] **[blocker]** `/api/health` returns 200
- [ ] **[blocker]** `/api/ready` returns 200 with all checks passing
- [ ] Liveness + readiness probes wired in Kubernetes / ECS / etc.
- [ ] Log shipping tested (Datadog, CloudWatch, Loki) — pick a few recent lines from `stdout` and confirm they land
- [ ] Sentry (if enabled): trigger a test exception via `/api/internal/test-error` or similar, confirm it appears
- [ ] Request ID round-trip tested: `curl -H "x-request-id: test-123" /api/me` and confirm `x-request-id: test-123` in the response + log line

### Functional smoke

- [ ] `/api/me` returns the current user's tenant + permissions
- [ ] Create a project, import BOQ, lock BOQ — all three land correct audit rows
- [ ] Submit and approve a DPR — BOQ `done_qty` moves, audit log has one envelope row + N ledger rows
- [ ] Submit and approve a RAB — BOQ `billed_qty` moves, cumulative cap enforced
- [ ] Try to approve something as a role that shouldn't — 403 with the canonical error envelope
- [ ] Attach a file to a GRN via presigned URL — `file_objects.status` flips `pending_upload` → `active`
- [ ] Run the full E2E test suite against the staging URL (`E2E_BASE_URL=https://staging... pnpm test`)

### Operations

- [ ] Runbook written — who gets paged, what the incident channel is, rollback procedure
- [ ] On-call rotation set up
- [ ] Backup restore runbook exists
- [ ] Secret rotation procedure documented
- [ ] First month review scheduled — check audit log growth, rate limit hits, DB size

### Communication

- [ ] Change log published
- [ ] Support team briefed on new error envelope format
- [ ] Customer comms sent (if migrating existing tenants)
- [ ] DNS TTL lowered before cutover so rollback is fast

---

## 12. File reference

| File | What it does |
|---|---|
| [src/lib/config/env.ts](src/lib/config/env.ts) | Zod env schema + boot validation |
| [src/lib/http/envelope.ts](src/lib/http/envelope.ts) | `ok()` / `err()` / `created()` response helpers |
| [src/lib/http/errors.ts](src/lib/http/errors.ts) | `DomainError` base + `toHttpResponse()` |
| [src/lib/observability/logger.ts](src/lib/observability/logger.ts) | JSON-lines logger with request id pickup |
| [src/lib/observability/sentry.ts](src/lib/observability/sentry.ts) | Sentry shim (optional) |
| [src/lib/workflow/rate-limit.ts](src/lib/workflow/rate-limit.ts) | Fixed-window rate limiter |
| [src/lib/workflow/idempotency.ts](src/lib/workflow/idempotency.ts) | Idempotency-Key guard |
| [src/lib/workflow/transitions.ts](src/lib/workflow/transitions.ts) | Status transition enforcer |
| [middleware.ts](middleware.ts) | Request id generation + auth redirect |
| [app/api/health/route.ts](app/api/health/route.ts) | Liveness probe |
| [app/api/ready/route.ts](app/api/ready/route.ts) | Readiness probe |
| [.env.example](.env.example) | Every required + optional variable |
| [prisma/schema.prisma](prisma/schema.prisma) | Canonical schema (custom Prisma output path) |

Run the full test suite before every deploy:
```bash
pnpm install --filter @quikit/quikinfra
pnpm exec prisma db push       # only against the test DB
pnpm exec prisma db seed       # only against the test DB
# Then:
pnpm test                      # 43 tests, runs against a live dev server
```

Pass rate must be 100% (excluding the 6 deliberately `test.skip`-ed
tests for Phase 2b migrations in progress).
