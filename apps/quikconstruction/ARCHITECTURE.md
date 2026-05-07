# QuickConstruction — Architecture & Handoff

A construction ERP for builders / contractors / infra companies. Single-repo Next.js 14 app (App Router) with embedded API routes, Prisma ORM on PostgreSQL, Playwright tests. Multi-tenant with role-based permissions and an approval-workflow engine.

> **Use this doc to brief a new Claude session.** It captures (a) the tech stack and module layout, (b) the conventions a new contributor must follow, (c) the BOQ import pipeline in depth, and (d) the fixes applied in the most recent session.

---

## 1. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router, route groups) |
| Language | TypeScript (strict) |
| DB / ORM | PostgreSQL via Prisma 5.22 (custom output: `node_modules/.prisma-qc/client`) |
| Auth | NextAuth (JWT sessions); demo-mode bypass for local + tests |
| State | TanStack React Query (`@tanstack/react-query`) |
| UI | React 18 + Tailwind CSS + lucide-react icons (no shadcn / no Material) |
| Validation | Hand-rolled validators in `src/lib/validators.ts`; Zod is in deps but lightly used |
| Excel | `xlsx` (SheetJS) for BOQ imports |
| Email | `nodemailer` (SMTP) with file-outbox fallback |
| PDFs | `pdf-lib` (PO / RFQ / DPR / RAB) |
| Tests | Playwright (API integration + E2E) |
| Dev port | 3010 (`pnpm dev` / `pnpm start`) |

---

## 2. Directory Map

```
QuickConstructionProject/
├── app/                           # Next.js App Router
│   ├── (dashboard)/               # Route group: authenticated pages, shared layout
│   │   ├── dashboard/page.tsx
│   │   ├── approvals/             # Approval inbox + actions
│   │   ├── finance/               # Client-billing, vendor-payments, petty-cash
│   │   ├── masters/               # Banks, customers, items, projects, vendors, etc.
│   │   ├── projects/              # BOQ, DPR, estimation, RAB, work-orders, hindrance
│   │   ├── purchase/              # Requisitions, indents, RFQs, orders
│   │   ├── store/                 # Issues, stock, transfers, GRN, gate-pass
│   │   ├── hrms/                  # Attendance, labour
│   │   └── settings/              # Users, roles, workflows
│   ├── api/                       # Route handlers (one folder per resource)
│   ├── login/                     # Public — outside dashboard group
│   ├── invite/                    # Public — invitation acceptance
│   └── layout.tsx                 # Root layout (NextAuth provider, fonts)
│
├── src/
│   ├── lib/                       # Server-side libraries (NOT bundled to client unless re-exported)
│   │   ├── auth/                  # context.ts, next-auth-options.ts
│   │   ├── rbac/                  # roles.ts, permissions.ts
│   │   ├── boq/                   # parser, adapters, hierarchy, ledgers — see §6
│   │   ├── purchase/              # purchase-engine, po-pdf, po-email
│   │   ├── store/                 # stock-service, ledger helpers, repositories
│   │   ├── projects/              # project-service, dpr/rab repositories
│   │   ├── approvals/             # approval-service, approver-chain
│   │   ├── workflow/              # idempotency, transitions, audit
│   │   ├── masters/               # one *-repository.ts per master entity
│   │   ├── http/                  # envelope.ts, route-wrappers.ts, errors.ts, pagination.ts
│   │   ├── observability/         # logger.ts, sentry.ts
│   │   ├── email/                 # mailer.ts (SMTP + file-outbox switch)
│   │   ├── db/                    # prisma.ts (singleton), doc-number.ts, auth-context.ts
│   │   └── validators.ts          # Hand-rolled mobile/email/GSTIN/PAN validators
│   ├── components/                # Client components (FormDrawer, QuickCreateDrawer, etc.)
│   └── hooks/                     # use-masters, use-projects, use-purchase, use-boq…
│
├── prisma/
│   ├── schema.prisma              # 74 models, all prefixed `Cn`
│   ├── migrations/
│   └── seed.ts                    # Demo tenant + users + a sample project
│
├── tests/
│   ├── api/                       # HTTP integration tests (no browser)
│   ├── e2e/                       # Playwright browser flows + fixtures/
│   └── ci/smoke.sh                # Build + migrate + seed + tests (CI entry)
│
├── docs/
│   ├── API_STANDARDS.md
│   ├── DB_OVERVIEW.md
│   └── DB_DEPLOYMENT.md
│
├── scripts/                       # User seeding, password reset, mail testing
├── middleware.ts                  # Edge: requestId, settings/* token gate
├── app-manifest.ts                # Permission keys, route map, event types
└── package.json                   # Scripts: dev, build, test, test:api, test:smoke
```

---

## 3. Functional Modules (page → API → service)

| Module | Page Route | API Route | Service / Repo |
|--------|-----------|-----------|----------------|
| **Dashboard** | `/dashboard` | `/api/dashboard` | reads aggregates from masters/projects |
| **Masters** | `/masters/{entity}` | `/api/masters/{entity}` + `/[id]` | `src/lib/masters/{entity}-repository.ts` |
| **Approvals** | `/approvals` | `/api/approvals/inbox`, `/api/approvals/[id]/[action]` | `src/lib/approvals/approval-service.ts` |
| **Purchase – Requisitions** | `/purchase/requisitions` | `/api/purchase/requisitions/*` | `src/lib/purchase/pr-repository.ts` |
| **Purchase – Indents** | `/purchase/indents` | `/api/purchase/indents/*` | indent-repository (3-level approval) |
| **Purchase – RFQs** | `/purchase/rfqs` | `/api/purchase/rfqs/*` | rfq-repository, rfq-email |
| **Purchase – Orders** | `/purchase/orders` | `/api/purchase/orders/*` | po-repository, po-pdf, po-email |
| **Store – GRN** | `/store/grn` | `/api/purchase/grn/*` | grn-repository (writes stock-ledger on approve) |
| **Store – Issues** | `/store/issues` | `/api/store/issues/*` | material-issue-repository |
| **Store – Transfers / Gate Pass / Returns / Reconciliation** | `/store/{...}` | `/api/store/{...}` | one repo per entity |
| **Projects – BOQ** | `/projects/boq` | `/api/projects/[projectId]/boq/*` | `src/lib/boq/*` (see §6) |
| **Projects – Estimation** | `/projects/estimation` | `/api/estimations/*` | estimation-repository |
| **Projects – Work Orders** | `/projects/work-orders` | `/api/projects/work-orders/*` | wo-repository |
| **Projects – DPR** | `/projects/dpr` | `/api/projects/dpr/*` | dpr-repository (writes BOQ progress ledger) |
| **Projects – RAB** | `/projects/rab` | `/api/projects/rab/*` | rab-repository (writes BOQ billing ledger) |
| **Projects – Hindrance** | `/projects/hindrance` | `/api/projects/hindrance/*` | hindrance-repository |
| **Finance – Client Billing** | `/finance/client-billing` | `/api/finance/client-billing/*` | client-billing-service |
| **HRMS – Attendance / Labour** | `/hrms/{entity}` | `/api/hrms/{entity}` | site-attendance repos |
| **Settings – Users / Roles / Workflows** | `/settings/{entity}` | `/api/settings/{entity}` | user-repository, role-repository, workflow-engine |

---

## 4. Cross-Cutting Infrastructure

### Auth & Permissions

- `src/lib/auth/context.ts` — every API route starts with:
  ```ts
  const ctxOrResponse = await requirePermission("construction.boq.import");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;
  ```
  Returns `TenantContext { tenantId, userId, roles, permissions }` or a 401/403 envelope.
- `src/lib/rbac/roles.ts` — 6 roles: `platform_super_admin`, `tenant_admin`, `project_manager`, `site_admin`, `accountant`, `user`. Each maps to a permission set.
- `src/lib/rbac/permissions.ts` — 100+ keys, all `construction.<domain>.<action>` (e.g., `construction.po.approve`).
- **Demo mode** — when `AUTH_DEMO_MODE=true`, the `x-test-role: <key>` request header overrides role resolution. Used by Playwright tests. **Never enable in prod.**
- `middleware.ts` — runs at edge: stamps `requestId`, gates `/settings/*` behind a token, handles password-reset bounce.

### HTTP Wrappers / Response Envelope

- `src/lib/http/envelope.ts` — `ok(data)` and `err(code, message, status)` produce the canonical shape:
  ```json
  { "ok": true,  "data": ..., "requestId": "req_..." }
  { "ok": false, "error": { "code": "BOQ_LOCKED", "message": "..." }, "requestId": "..." }
  ```
- `src/lib/http/route-wrappers.ts` — `withMutationRoute(req, { entityLabel, parseBody, successStatus }, handler)` and `withListRoute(...)`. Handles auth gate, body parsing, Prisma error mapping, envelope wrapping.
- `src/lib/http/prisma-errors.ts` — `P2002` → 409 (unique violation), `P2003` → 400 (FK violation), `P2025` → 404 (not found).
- `src/lib/http/pagination.ts` — `parsePagination(req)` returns `{ paginated, page, pageSize, skip, take }`.

### Logger

- `src/lib/observability/logger.ts` — JSON-lines stdout logger.
- **Convention:** `logger.info({ msg: "boq_upload_previewed", projectId, fileName, rowCount, userId })`. Message key is a snake_case event name; values are structured fields. Never interpolate variables into the `msg`.

### Idempotency

- `CnIdempotencyKey` Prisma model: `{ key, tenantId, bodyHash, statusCode, response, expiresAt }`.
- `src/lib/workflow/idempotency.ts` — `idempotencyGuard(req, ctx, routeKey)`. Reads `Idempotency-Key` header; replays cached response on retry. Auto-generates a key if missing.
- **Apply to** every approval action and any mutation that triggers side effects (ledger writes, emails, doc-number consumption).

### Approval Workflow Engine

- `src/lib/approvals/approval-service.ts` — `execute({ ctx, instanceId, action, comments, onFinalApproval })`:
  1. Loads the approval instance + current step
  2. Checks the user has the step's required permission
  3. Records the action in `CnApprovalHistory`
  4. Advances or terminates the workflow
  5. Runs `onFinalApproval` callback inside the same Prisma txn (e.g., write stock ledger, generate PO PDF)
- Step-required permission resolved via `getRequiredPermissionForStep(entityType, stepOrder)` in `src/lib/rbac/roles.ts`.

### Email

- `src/lib/email/mailer.ts` — auto-switches: SMTP if `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` set; else writes `.eml` files to `MAIL_OUTBOX_DIR` (default `.data/outbox/`).
- Used by PO send, RFQ send, password reset, approval notifications.

### Document Numbers

- `src/lib/db/doc-number.ts` — `nextDocNumber(ctx, projectId, entityType)` returns project-scoped numbers like `PR-SITE01-2026-0001`. Backed by `CnDocNumberCounter` row + atomic increment in a txn.

---

## 5. Database Conventions

- **All models prefixed `Cn`** (historical — "construction"). E.g. `CnUser`, `CnPurchaseOrder`, `CnBOQItem`.
- **`tenantId` on every model**, plus `orgId` for org-level scoping. Composite uniques and indexes always include `tenantId`.
- **Soft delete** for masters: `status = 'inactive'`, never `DELETE`. Hard delete only for transient join rows.
- **Money** is `Decimal(18, 2)`. **Quantity** is `Decimal(18, 4)`. **Never `Float`** — Prisma Float maps to `double` and silently truncates.
- **Append-only ledgers** for side effects:
  - `CnStockLedger` — every issue / receipt / transfer / reconciliation appends a row. Balances are cached in `CnStockBalance`.
  - `CnBOQProgressLedger` — DPR approval appends; reversal appends a compensating row with `direction = -1`.
  - `CnBOQBillingLedger` — same pattern for RAB.
  - `CnApprovalHistory` — every workflow action appends.
  - `CnAuditLog` — every data change.
- **Multi-tenant queries** must always include `tenantId` in `where` — `findUnique` on a non-tenant-scoped key is a leak. Repositories enforce this; never query `prisma.cnFoo.findUnique({ where: { id } })` from a route.

---

## 6. BOQ Import Pipeline (Deep Dive)

This is the module I worked in. New sessions touching BOQ import should read this section carefully.

### Entry Points

| Endpoint | Purpose |
|----------|---------|
| `POST /api/projects/[projectId]/boq/preview-upload` | Upload `.xlsx`, dry-run pipeline, return preview (errors/warnings + sample rows + full normalized rows). No DB writes. |
| `POST /api/projects/[projectId]/boq/import` | Confirm — caller posts back the rows from preview, server re-validates and persists in a txn. |
| `POST /api/projects/[projectId]/boq/detect-columns` | For Universal mode — returns suggested column → standard-field mapping. |
| `POST /api/projects/[projectId]/boq/lock` / `.../unlock` | Lock the BOQ so `tenderQty` and `rate` become read-only. Only super-admin can unlock. |

### Pipeline (`src/lib/boq/import/pipeline.ts`)

```
RawSheet[] → detect mode → adapter → normalize → resolveHierarchy → validate → PipelineResult
```

1. **Detect** (`detector.ts`) — sniff each sheet structurally (never by name). Returns `STRICT_TEMPLATE | GENERIC_SOR | UNKNOWN`.
2. **Adapter dispatch:**
   - `STRICT_TEMPLATE` → `strict-adapter.ts` — 6 fixed columns (BOQ No, SOR No, Description, Unit, Rate, Op. Undone Qty).
   - `GENERIC_SOR` / `ALPHABETIC_SOR` → `generic-adapter.ts` — column roles detected by header aliases (`ROLE_ALIASES`).
   - `UNIVERSAL` → `universal-adapter.ts` — user-supplied column map; goes through a /detect-columns + form step.
   - Default fallback: `GENERIC_SOR`.
3. **Flatten + enrich** — merge per-sheet rows; inject `projectId`, `tenantId`, `importBatchId`.
4. **Hierarchy** (`hierarchy.ts`) — assign `parentBoqNo` + `sortOrder`. Algorithm: prefix-first, stack-fallback.
   - `prefixParent("A.2.1.1")` → `A.2.1`. If exists in same category, that's the parent.
   - Else walk the parent stack (indexed by depth) and pick the most recent ancestor whose code is a *true prefix* of the current ref.
5. **Validate** (`validator.ts`) — cross-row invariants. Notable: duplicate `(category, boqNo)` is **not** rejected; the second occurrence is auto-suffixed `_2`, `_3`, … and a non-blocking warning is emitted (because real-world BOQs reuse short refs across sections).
6. **Summary** — counts per category, sample rows, aggregated errors/warnings.

### Key files

| File | Role |
|------|------|
| `src/lib/boq/import/types.ts` | `RawSheet`, `NormalizedBoqRow`, `ImportIssue`, `PipelineResult` |
| `src/lib/boq/import/cell-utils.ts` | `parseNumeric`, `dotDepth`, `prefixParent`, `isHeaderLabel` |
| `src/lib/boq/import/uom-map.ts` | `normalizeUom`, `isKnownUom` |
| `src/lib/boq/import/number-parser.ts` | `parseIndianNumber` (lakh / crore suffixes, `,` thousands) |
| `src/lib/boq/import/category-map.ts` | Sheet name → canonical category (Civil / Electrical / Road); ignore-list (INSTRUCTIONS, etc.) |
| `src/lib/boq/import/strict-adapter.ts` | 6-column QuikConstruction template |
| `src/lib/boq/import/generic-adapter.ts` | Aakar / govt SOR; **most real imports go through here** |
| `src/lib/boq/import/universal-adapter.ts` | Manual mapping; covers vendor quotes / arbitrary layouts |
| `src/lib/boq/import/hierarchy.ts` | Parent-resolution algorithm |
| `src/lib/boq/import/validator.ts` | Dedup + cross-row checks |
| `src/lib/boq/billing-ledger.ts` | RAB billing append/reverse |
| `src/lib/boq/progress-ledger.ts` | DPR progress append/reverse |
| `src/lib/boq/repository.ts` | Persist normalized rows in a txn; lock state |

---

## 7. Conventions to Follow

### File Naming
- **Page:** `app/{group}/{module}/{entity}/page.tsx`
- **Route:** `app/api/{domain}/{resource}/route.ts`
- **Repository:** `src/lib/{domain}/{entity}-repository.ts` — CRUD + scoped queries.
- **Service:** `src/lib/{domain}/{entity}-service.ts` — domain logic + side effects.
- **Hook:** `src/hooks/use-{domain}.ts` — wraps API endpoints with React Query.

### When Adding a New API Route

1. Write the route under `app/api/...` and start with `requirePermission(...)`.
2. Use `withMutationRoute` for POST/PUT/DELETE (auto envelope + Prisma error map).
3. For mutations with side effects, wrap in `prisma.$transaction(async (tx) => {...})` and pass `tx` down to the repository.
4. For mutations the user might retry (approvals, financial txns), wrap in `idempotencyGuard`.
5. After persisting, log: `logger.info({ msg: "<entity>_<action>", entityId, userId, tenantId })`.
6. If the action triggers a notification or email, queue it inside the same txn (or use the file-outbox).

### When Adding a Form
- Use `FormDrawer` for create/edit (slide-over from right).
- Use `QuickCreateDrawer` for transactions with line items.
- Validate on submit with helpers from `src/lib/validators.ts`.
- After mutation, call `qc.invalidateQueries({ queryKey: ["<domain>"] })`.

### Drawers in BOQ
- `BOQImportDrawer` — multi-step: Pick file → (optional) Map columns → Preview → Confirm.
- It posts to `/preview-upload` first; only on user confirmation does it POST to `/import` with the rows already normalized.

### What NOT to do
- ❌ Don't use `Float` in Prisma. Always `Decimal`.
- ❌ Don't `findUnique({ where: { id } })` in routes. Always include `tenantId`.
- ❌ Don't hard-delete masters. Set `status = 'inactive'`.
- ❌ Don't put domain logic in `route.ts`. Repositories + services own logic; routes just gate, parse, dispatch, envelope.
- ❌ Don't add `// removed X` comments or `_unused` renames when deleting code. Just delete it.
- ❌ Don't write planning / decision docs unless explicitly asked.

---

## 8. Testing

```bash
pnpm test:api        # Playwright HTTP-only tests, ~30s
pnpm test:e2e        # Browser E2E flows
pnpm test            # Both
pnpm test:smoke      # build + migrate + seed + all tests (full CI)
pnpm test:smoke:fast # Same, skips E2E
```

- `tests/api/` — `auth-gates`, `tenant-isolation`, `idempotency`, `txn-rollback`, `invalid-transitions`, `boq-import-pipeline`.
- `tests/e2e/` — `smoke`, `login`, `boq-and-masters`, `purchase-flow`, `stock-and-issue`, `dpr-rab-progress`, `reject-return-role`.
- `tests/e2e/fixtures/` — factories (`makeProject`, `makeVendor`, `makeBOQWorkbook`) and flow helpers (`seedProjectWithMasters`, `submitAndApproveDPR`).
- **Demo mode in tests:** `AUTH_DEMO_MODE=true` + `x-test-role` header to switch personas without real login.

### Pre-existing test failures (8) — unrelated to recent BOQ work

`tests/api/boq-import-pipeline.spec.ts` has 8 pre-existing failures involving the strict template adapter and depth-cap (test expects depth 5, code caps at 3). These were failing before recent edits and stay failing after. They need a separate fix to either the test expectations or the adapter — out of scope for the BOQ import format issue.

---

## 9. Recent Session Changes — BOQ Import Format Fix

### Problem
User uploads a BOQ Excel where the column header is just `SOR` (not `S.No.` / `SOR No` / `BOQ No`). The Excel mixes two formats:
- Some rows use full dotted codes (`A.2.1`, `A.2.1.1`, `A.8.A`).
- Other rows use letter-only codes under a dotted parent (parent `A.2.1` → children `a`, `b`, `c`, `d`).

After import, items with letter-only codes were:
1. Not nested under their dotted parent.
2. Mangled by the dedup logic into `a`, `a_2`, `a_3`, `b`, `b_2`, `b_3`, … (because the same `a` appeared in many sections).

### Root causes
1. **Header alias gap:** Plain `SOR` wasn't in `ROLE_ALIASES.sorItem` of `generic-adapter.ts`. `isHeaderLabel` does an exact match (after stripping spaces/dots), so `SOR` failed to match `SOR No` / `SOR Numbers`. The whole sheet bailed to a fallback path.
2. **No carry-forward for letter-only sub-codes:** When a row's SOR cell was just `a` / `b`, the parser stored `a` as the full BOQ ref. Hierarchy resolution couldn't connect it to the recent `A.2.1` parent, and dedup auto-suffixed siblings.

### Files changed

| File | Change |
|------|--------|
| `src/lib/boq/import/generic-adapter.ts:64` | Added `"SOR"`, `"SOR Code"`, `"SOR Ref"` to `ROLE_ALIASES.sorItem` so the bare `SOR` header is recognized. |
| `src/lib/boq/import/generic-adapter.ts:213-220` | New `lastDottedParent` carry-forward state. |
| `src/lib/boq/import/generic-adapter.ts:280-290` | When current ref matches `/^[a-zA-Z]{1,3}$/` and `lastDottedParent` is set, synthesize `boqNo = parent.letter`. Track via `wasSynthesized`. |
| `src/lib/boq/import/generic-adapter.ts:379` | `rawBoqNo: rawRef` (audit-trail keeps the original cell value). |
| `src/lib/boq/import/generic-adapter.ts:412-419` | After classification, update `lastDottedParent` only when the row is a group with a dotted ref AND wasn't itself synthesized. (Prevents a leaf like `A.2.1.1` from shadowing the real group `A.2.1`.) |
| `src/lib/boq/import/universal-adapter.ts:150` | Added `/^sor$/i`, `/sorcode/i`, `/sorref/i` to the `boq_number` auto-suggest patterns. |
| `src/lib/boq/import/universal-adapter.ts:343` | New `lastDottedParent` state. |
| `src/lib/boq/import/universal-adapter.ts:398-417` | Same carry-forward logic as the generic adapter, gated on `type === SECTION_HEADER`. |

### Verification
A scratch script ran the user's exact Excel structure through `runImportPipeline`:

```
[G] A                                 (top-level folder)
    [L] A.1.1     parent=A            raw=A.1.1
    [G] A.2.1     parent=A            raw=A.2.1            (folder)
        [L] A.2.1.a   parent=A.2.1    raw=a
        [L] A.2.1.b   parent=A.2.1    raw=b
        [L] A.2.1.c   parent=A.2.1    raw=c
        [L] A.2.1.d   parent=A.2.1    raw=d
    [G] A.3.1     parent=A            raw=A.3.1            (folder)
        [L] A.3.1.a   parent=A.3.1    raw=a
        ...
    [L] A.4.1     parent=A            raw=A.4.1
```

`rawBoqNo` preserves the literal cell value; `boqNo` is the synthesized full path; hierarchy renders correctly with no `_2`/`_3` mangling.

---

## 10. How to Brief a New Session

When you open a new Claude Code session and want to continue this work, paste or reference:

1. **This file** — gives the new session full project context.
2. **The user prompt** — what you want done next (e.g. "fix the depth-cap test mismatch", "add audit log endpoint", "wire DPR reject/return route").
3. **The relevant section** — point at §6 for BOQ work, §4 for HTTP/auth/idempotency conventions, §5 for DB conventions.

If the task is BOQ-related, also include:
- The Excel file (raw `.xlsx`) — let the new session inspect cells via SheetJS rather than guessing from screenshots.
- The exact failure mode (which rows came through wrong, what the user expected).

If the task spans multiple modules, point at the module table in §3 to locate the page → API → repo for each.

---

## Quick Reference Card

```
ENVELOPE          { ok, data | error: { code, message }, requestId }
AUTH GATE         await requirePermission("construction.<domain>.<action>")
TENANT SCOPE      Always include tenantId in every Prisma where clause
LEDGER PATTERN    Append-only; reversal = compensating row, never UPDATE
DOC NUMBER        nextDocNumber(ctx, projectId, "PO") → "PO-PROJ-FY-####"
IDEMPOTENCY       idempotencyGuard(req, ctx, "approve-po") for replays
DEMO MODE         AUTH_DEMO_MODE=true + x-test-role header (NEVER prod)
LOG               logger.info({ msg: "snake_case_event", ...fields })
DECIMAL           Money 18,2 — Quantity 18,4 — Never Float
SOFT DELETE       status = 'inactive' on masters
MIDDLEWARE        Edge — requestId stamping, /settings/* token gate
BOQ ENTRY POINTS  /preview-upload (dry-run) → /import (persist)
```
