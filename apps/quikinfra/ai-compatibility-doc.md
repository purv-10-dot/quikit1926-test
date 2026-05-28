# QuikInfra — AI Runtime Compatibility Document

- **Date:** 2026-05-07
- **Author:** Bhavna Tikare (bhavna.tikare@moreyeahs.com)
- **Branch:** feature/quikERP-module-working

---

## Section 1: App Identity

```
App slug:           quikinfra
App name:           QuikInfra
App key:            quikinfra
Category:           Construction ERP
Current dev URL:    http://localhost:3004 (next dev -p 3004)
Prod start URL:     http://localhost:3007 (next start -p 3007 — port renumber per recent commit)
Tech stack:         Next.js 14.0.4 (App Router) · TypeScript 5.3 · Prisma 5.x ·
                    PostgreSQL · NextAuth 4.24 · React Query 5 · Tailwind ·
                    Zod 3.22 · Nodemailer 7
Team lead:          Bhavna Tikare
Repository:         apps/quikinfra in QuikIT monorepo
Provider order:     SessionProvider → QueryClientProvider → ThemeProvider
Login route:        /login
Middleware:         Custom (apps/quikinfra/middleware.ts) — does NOT use
                    @quikit/auth/middleware (deviates from standard QuikIT app pattern)
```

### Critical notes about the app structure
- **Two Prisma schemas exist** and they disagree:
  - `apps/quikinfra/prisma/schema.prisma` (2391 lines) — **historical/local**, uses `tenantId + orgId` dual-scope, references models by old names. Some code paths still reference its shape.
  - `packages/database/prisma/schema.prisma` (5376 lines, Cn* models start at line 2080) — **canonical**, used by the build (`prebuild` runs `prisma generate --schema=../../packages/database/prisma/schema.prisma`). Uses `orgId` only (drops `tenantId`). All finance / HR / approvals models live ONLY here.
- This dual-schema state is a **migration in progress**. Older routes (purchase, store, masters) still call `db.cnX.findFirst({ where: { tenantId, orgId, ... }})`. Newer routes (finance, audit, documents, HRMS) use `withOrgAuthForModule` and filter only by `orgId`.
- The AI Runtime team should treat the **shared `packages/database/prisma/schema.prisma` as authoritative** because that's what `prisma generate` actually produces in CI. The local schema describes the "as currently coded" surface area but is not the deployed schema.

---

## Section 2: Complete Prisma Schema

### 2a. Local app schema (apps/quikinfra/prisma/schema.prisma)

> Verbatim copy of the local schema is **omitted from this document** to keep it readable (2391 lines). Read directly from the repo at `apps/quikinfra/prisma/schema.prisma`. Models are `Cn*` prefixed and live in the `app_quikinfra` Postgres schema. Below is the full model list extracted from that file.

**Models in local schema (74 total):**

```
Master Data (16):
  CnCompany, CnFinancialYear, CnProject, CnItemGroup, CnItem, CnUOM,
  CnVendor, CnContractor, CnCustomer, CnLocation, CnGSTCode, CnTDSCode,
  CnBank, CnDepartment, CnWorkCategory, CnCostCenter, CnMachinery,
  CnTermsCondition

Purchase & Procurement (10):
  CnPurchaseRequisition, CnPurchaseRequisitionLine,
  CnPurchaseIndent, CnPurchaseIndentLine,
  CnRfq, CnRfqLine, CnRfqVendor,
  CnPurchaseOrder, CnPurchaseOrderLine,
  CnGoodsReceiptNote, CnGRNLine

Store & Inventory (16):
  CnStockLedger (APPEND-ONLY), CnStockBalance,
  CnMaterialIssue, CnMaterialIssueLine,
  CnGatePass, CnGatePassLine,
  CnGoodReturn, CnGoodReturnLine,
  CnInternalReturn, CnInternalReturnLine,
  CnStockTransfer, CnStockTransferLine,
  CnStockReconciliation, CnStockReconciliationLine,
  CnDieselLog, CnAsset

Project Management (12):
  CnBOQItem (legacy), CnBOQItemV2, CnBOQImportBatch, CnBOQLockState,
  CnMaterialEstimation,
  CnWorkOrder, CnWorkOrderLine,
  CnDailyProgressReport, CnDPRWorkItem, CnDPRLabourEntry,
  CnDPRMachineryEntry, CnDPRMaterialEntry,
  CnRunningAccountBill, CnRABLine

Workflow / Audit (5):
  CnApprovalWorkflow, CnApprovalWorkflowStep,
  CnApprovalInstance, CnApprovalHistory,
  CnNotification, CnAuditLog

Append-only Ledgers (2):
  CnBOQProgressLedger (DPR postings), CnBOQBillingLedger (RAB postings)

RBAC (3):
  CnRole, CnPermission, CnRolePermission

Identity (3):
  CnUser (real invited users), CnDemoUser (seeded demo accounts), QuikitUser (read-only mirror of central auth.User)

Infra (3):
  CnIdempotencyKey, CnFileObject
```

### 2b. Canonical shared schema (packages/database/prisma/schema.prisma) — additional Cn* models

Models present in the **shared schema only** (live data lives here at runtime). Routes using these MUST go through the orgId-only pattern:

```
Finance (10):
  CnClientInvoice, CnClientInvoiceLine,
  CnClientReceipt, CnClientReceiptAllocation,
  CnVendorBill, CnVendorBillLine,
  CnVendorPayment, CnVendorPaymentAllocation,
  CnCreditNote, CnDebitNote, CnExpense

HRMS (4):
  CnEmployee, CnAttendance, CnPayroll, CnPayrollLine

Quality / Safety (3):
  CnQCInspection, CnQCDefect, CnSafetyIncident, CnSafetyChecklist

Misc (3):
  CnDocument, CnApprovalRule, CnApprovalRequest, CnHindrance,
  CnNumberSequence
```

> **The AI Runtime team should treat the shared schema as the source of truth** for what actually exists in production at runtime. The local schema is a stale subset and is missing Finance, HRMS, QC, Safety, Documents, ApprovalRule/Request, NumberSequence.

### 2c. Per-model analysis (consolidated, against the shared schema)

| Model | Schema | Primary entity? | orgId? | createdBy? | deletedAt? | Searchable? | Has summary endpoint? |
|---|---|---|---|---|---|---|---|
| CnCompany | app_quikinfra | Yes | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnVendor | app_quikinfra | Yes | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnCustomer | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnContractor | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnProject | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnItem | app_quikinfra | Yes | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnPurchaseRequisition | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnPurchaseIndent | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnRFQ | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnPurchaseOrder | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnGoodsReceiptNote | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnMaterialIssue | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnStockTransfer | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnStockReconciliation | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnGatePass | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnGoodReturn | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnDieselLog | app_quikinfra | Yes | ✅ | ✅ | ❌ (no soft delete) | — | ❌ |
| CnAsset | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnBOQ | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnBOQItem (legacy) | app_quikinfra | Yes | ✅ | ✅ | ❌ | — | ❌ |
| CnBOQItemV2 | app_quikinfra | Yes (current) | ✅ | ✅ | ✅ (soft delete) | — | ❌ |
| CnDPR | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | — | ❌ |
| CnEstimation | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnHindrance | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnWorkOrder | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | manifest only | ❌ |
| CnRAB | app_quikinfra | **Yes (key)** | ✅ | ✅ | ✅ | — | ❌ |
| CnClientInvoice | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnClientReceipt | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnVendorBill | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnVendorPayment | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnCreditNote | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnDebitNote | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnExpense | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnEmployee | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnAttendance | app_quikinfra | No (transactional) | ✅ | ✅ | ❌ | — | ❌ |
| CnPayroll | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnApprovalRequest | app_quikinfra | Yes | ✅ | ✅ | ❌ | — | ❌ |
| CnSafetyIncident | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnQCInspection | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnDocument | app_quikinfra | Yes | ✅ | ✅ | ✅ | — | ❌ |
| CnAuditLog | app_quikinfra | infra | ✅ | (userId) | n/a | — | n/a |
| CnStockLedger | app_quikinfra | infra (append-only) | ✅ | ✅ | ❌ (immutable) | — | n/a |

### 2d. Schema violations of the App Contract

**Models missing `orgId`:** None in the canonical shared schema. The local schema still uses `tenantId + orgId` on every model — which is *more* scoping than required, not less. The AI Runtime can ignore tenantId for now; org isolation in the deployed DB is via `orgId` only.

**Models missing `@@index([orgId])`:** None observed; every Cn* model has at least one index that begins with `orgId`. Many additionally have composite indexes (e.g. `@@index([orgId, status, createdAt(sort: Desc)])`) for hot-path list queries.

**Models missing `createdBy`:** `CnStockLedger` uses `createdBy` (the user who triggered the side effect), `CnApprovalHistory` uses `actionById` (the actor for that step). All primary-entity models have `createdBy + updatedBy`.

**Models missing `@@schema(...)` directive:** None. Every Cn* model declares `@@schema("app_quikinfra")`. Only `QuikitUser` is in `auth` schema (read-only mirror of the central tenant's auth.User table).

**Cross-schema `@relation` to other apps:** None. Cn* models relate only to other Cn* models or to the shared `Org` (the tenant scope) via `org @relation`.

**Models missing `deletedAt` that should support soft delete:**
- `CnBOQItem` (legacy, kept for back-compat — replaced by `CnBOQItemV2` which has soft delete).
- `CnAttendance`, `CnDieselLog` — high-volume transactional rows, current convention is hard delete; not blocking.
- `CnApprovalInstance`, `CnApprovalHistory`, `CnApprovalRequest` — workflow state, hard delete is intentional.
- `CnIdempotencyKey` — has `expiresAt` instead.

---

## Section 3: Complete API Endpoint Inventory

The app exposes **239 API route files** under `app/api/`. Documenting every parameter for every route in this document would balloon it to ~30k lines and add little value over the source code itself. Instead, this section gives the **complete route list**, the patterns every route follows, and per-route details for the routes most relevant to AI tool calls.

### 3a. Auth & response patterns (every route follows ONE of these two)

**Pattern A (older — most routes):**
```typescript
import { getTenantContext } from "@/lib/auth/context";

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  // ...uses ctx.tenantId + ctx.orgId in WHERE clause
  return NextResponse.json({ data, total });
}
```

Auth resolution order (from `src/lib/auth/context.ts`):
1. Real NextAuth session (CnUser or CnDemoUser)
2. Test header `x-test-role` (dev only — gated on `NODE_ENV !== "production"` AND `AUTH_DEMO_MODE !== "false"`)
3. Demo super-admin fallback (when `AUTH_DEMO_MODE=true`, default in dev)
4. null → 401 in production

Permission gates: `requirePermission("boq.lock")`, `requireAnyPermission([...])`, `requireAllPermissions([...])`, `requireRole([...])`. All defined in `src/lib/auth/context.ts`. Permission keys catalog in `src/lib/rbac/permissions.ts`.

**Pattern B (newer — finance, audit, documents, HRMS):**
```typescript
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("finance");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const list = await db.cnClientInvoice.findMany({ where: { orgId, deletedAt: null }, ... });
  return NextResponse.json({ success: true, data: list });
});
```
Returns `{ success: true, data }` envelope (NOT the same as Pattern A's `{ data, total }`). orgId-only filter (no tenantId).

**Response envelopes are inconsistent across the app:**
- `{ data, total }` — most list endpoints (older).
- `{ data, total, page, pageSize, hasMore }` — paginated list endpoints when `?page` or `?pageSize` is passed.
- `{ success: true, data }` — finance/audit/documents/HRMS routes via `withOrgAuthForModule`.
- `{ ok: true, data, requestId }` / `{ ok: false, error, code, requestId }` — newer routes that wrap with `withMutationRoute` from `src/lib/http/route-wrappers.ts`. Used in BOQ pipeline routes and a few approvals routes.
- `{ error, code }` — most error responses (legacy).
- `{ error, code, details }` — newer error responses with structured details.

The AI Runtime tool executor will need to handle **all four** envelope shapes. There is no single canonical envelope across the app.

### 3b. Full route list (239 routes)

Grouped by module. Each route exists at `app/api/<path>/route.ts`. Methods inferred from file content; `[id]` segments are dynamic.

#### Auth, account, infra
```
GET   /api/health                          — liveness probe (no auth, no DB)
GET   /api/ready                           — readiness probe (DB ping)
*     /api/auth/[...nextauth]              — NextAuth handler
POST  /api/account/reset-password          — set new password
GET   /api/me                              — current user context + permissions
GET   /api/sequence/next                   — next document number for a (project, type)
GET   /api/audit                           — audit log query (entityType, entityId, userId filters)
POST  /api/debug/mail-test                 — SMTP send test (dev-only)
GET   /api/dashboard                       — KPIs + summary cards
GET   /api/docs                            — markdown doc index
```

#### Invites & users
```
GET   /api/invites/[token]                 — fetch invite metadata
POST  /api/invites/accept                  — accept invite + set password
GET   /api/settings/users                  — list users
POST  /api/settings/users                  — invite user
GET   /api/settings/users/[id]             — user detail
PATCH /api/settings/users/[id]             — update user (role, modules, projects)
DELETE /api/settings/users/[id]            — soft-delete user
POST  /api/settings/users/[id]/resend-invite — resend invite email
GET   /api/settings/workflows              — list approval workflows
POST  /api/settings/workflows              — create workflow
GET   /api/settings/workflows/[id]         — workflow detail
PATCH /api/settings/workflows/[id]         — update workflow steps
```

#### Masters (entity CRUD — all follow same pattern)
```
GET/POST  /api/masters/projects, /api/masters/projects/[id]
GET/POST  /api/masters/items, /api/masters/items/[id]
GET/POST  /api/masters/item-groups, /api/masters/item-groups/[id]
GET/POST  /api/masters/uom, /api/masters/uom/[id]
GET/POST  /api/masters/vendors, /api/masters/vendors/[id]
GET/POST  /api/masters/contractors, /api/masters/contractors/[id]
GET/POST  /api/masters/customers, /api/masters/customers/[id]
GET/POST  /api/masters/companies, /api/masters/companies/[id]
GET/POST  /api/masters/banks, /api/masters/banks/[id]
GET/POST  /api/masters/departments, /api/masters/departments/[id]
GET/POST  /api/masters/work-categories, /api/masters/work-categories/[id]
GET/POST  /api/masters/cost-centers, /api/masters/cost-centers/[id]
GET/POST  /api/masters/locations, /api/masters/locations/[id]
GET/POST  /api/masters/financial-years, /api/masters/financial-years/[id]
GET/POST  /api/masters/gst, /api/masters/gst/[id]
GET/POST  /api/masters/tds, /api/masters/tds/[id]
GET/POST  /api/masters/terms, /api/masters/terms/[id]
GET/POST  /api/masters/machinery, /api/masters/machinery/[id]
GET/POST  /api/masters/assets, /api/masters/assets/[id]
GET/POST  /api/masters/[entity], /api/masters/[entity]/[id]   — generic fallback
GET       /api/masters/users               — read-only user picker
```

Per-master pattern:
- **GET (list):** auth → `parsePagination(req)` → repo `listX(opts)` + `countX(opts)` via `paginateDb` → `cachedJson(result, "medium")` (5-min HTTP cache).
- **POST (create):** auth → Zod-light validators (`src/lib/validators.ts`) → repo `createX(...)` → 201 with record. P2002 → 409, P2003 → 400.
- **GET (detail):** repo `findById(tenantId, id)` → 200 or 404.
- **PATCH (update):** repo `updateX(...)` → 200. P2025 → 404.
- **DELETE:** soft-delete (sets `status='inactive'`) for masters; never hard delete.

#### Purchase
```
GET   /api/purchase/dashboard               — counts + AP totals snapshot

GET   /api/purchase/requisitions            — list PRs
POST  /api/purchase/requisitions            — create PR
GET   /api/purchase/requisitions/[id]       — PR detail
PATCH /api/purchase/requisitions/[id]       — update PR (draft only)
DELETE /api/purchase/requisitions/[id]      — soft-delete PR
POST  /api/purchase/requisitions/[id]/submit  — submit PR for approval (status → pending_approval)
POST  /api/purchase/requisitions/[id]/approve — approve / reject / return PR

GET   /api/purchase/indents                 — list indents
POST  /api/purchase/indents                 — create (PR-backed or direct)
GET   /api/purchase/indents/[id]            — indent detail
PATCH /api/purchase/indents/[id]            — update indent
POST  /api/purchase/indents/[id]/submit     — submit
POST  /api/purchase/indents/[id]/approve    — approve (L1/L2/L3 step routing)

GET   /api/purchase/rfqs                    — list RFQs
POST  /api/purchase/rfqs                    — create RFQ from indent
GET   /api/purchase/rfqs/[id]               — RFQ detail (vendors, lines, quotes)
PATCH /api/purchase/rfqs/[id]               — update RFQ
POST  /api/purchase/rfqs/[id]/submit        — submit
POST  /api/purchase/rfqs/[id]/approve       — approve (allows vendor send)
POST  /api/purchase/rfqs/[id]/award         — award to chosen vendor
POST  /api/purchase/rfqs/[id]/convert-to-po — generate PO from awarded RFQ
GET   /api/purchase/rfqs/[id]/preview       — printable preview HTML
GET   /api/purchase/rfqs/[id]/preview/pdf   — PDF render via pdf-lib
POST  /api/purchase/rfqs/[id]/vendors/[vendorRowId]/quote — capture vendor quote

GET   /api/purchase/orders                  — list POs
POST  /api/purchase/orders                  — create PO (single or split per-vendor)
GET   /api/purchase/orders/[id]             — PO detail
PATCH /api/purchase/orders/[id]             — update PO (draft only)
DELETE /api/purchase/orders/[id]            — soft-delete PO
POST  /api/purchase/orders/[id]/submit      — submit
POST  /api/purchase/orders/[id]/approve     — approve (L1/L2)
POST  /api/purchase/orders/[id]/send        — mark sent to vendor (email triggered separately)
POST  /api/purchase/orders/[id]/close       — close PO (with closeReason)
GET   /api/purchase/orders/[id]/preview     — printable preview
GET   /api/purchase/orders/[id]/preview/pdf — PDF

GET   /api/purchase/grn                     — list GRNs (legacy path; /api/store/grn is preferred)
POST  /api/purchase/grn                     — create GRN
GET   /api/purchase/grn/[id]                — GRN detail
POST  /api/purchase/grn/[id]/submit         — submit
POST  /api/purchase/grn/[id]/approve        — approve (posts inward stock to ledger)
```

#### Store (inventory + transactional movement)
```
GET   /api/store/stock-balance              — current qty per (project, location, item)
GET   /api/store/stock-ledger               — append-only ledger query
GET   /api/store/stock-register             — formatted register report (stock-balance with summary)

GET/POST  /api/store/grn, /api/store/grn/[id]
POST  /api/store/grn/[id]/post              — finalize GRN (writes to ledger)

GET   /api/store/issues                     — list material issues
POST  /api/store/issues                     — create issue
GET   /api/store/issues/[id]                — issue detail
POST  /api/store/issues/[id]/submit         — submit
POST  /api/store/issues/[id]/approve        — approve (deducts stock)
POST  /api/store/issue/[id]/approve         — alias (older path)
GET/POST  /api/store/material-issue, /api/store/material-issue/[id]
POST  /api/store/material-issue/[id]/post   — finalize issue (legacy path)

GET/POST  /api/store/transfers, /api/store/transfers/[id]
POST  /api/store/transfers/[id]/submit      — submit transfer
POST  /api/store/transfers/[id]/approve     — approve transfer
POST  /api/store/transfers/[id]/dispatch    — mark dispatched (qtyOut at source)
POST  /api/store/transfers/[id]/receive     — mark received (qtyIn at dest)
GET/POST  /api/store/stock-transfer, /api/store/stock-transfer/[id]
POST  /api/store/stock-transfer/[id]/post   — legacy finalize
POST  /api/store/transfer/[id]/approve      — alias

GET   /api/store/reconciliations
GET/POST  /api/store/stock-reconciliation, /api/store/stock-reconciliation/[id]
POST  /api/store/stock-reconciliation/[id]/post  — finalize (writes adjustment to ledger)
POST  /api/store/reconciliation/[id]/approve     — approve

GET/POST  /api/store/gate-passes, /api/store/gate-passes/[id]
POST  /api/store/gate-passes/[id]/submit
POST  /api/store/gate-passes/[id]/approve
POST  /api/store/gate-passes/[id]/close
GET/POST  /api/store/gate-pass, /api/store/gate-pass/[id]    — legacy aliases

GET/POST  /api/store/good-returns, /api/store/good-returns/[id]
POST  /api/store/good-returns/[id]/submit
POST  /api/store/good-returns/[id]/approve
POST  /api/store/good-returns/[id]/dispatch
GET/POST  /api/store/good-return, /api/store/good-return/[id]
POST  /api/store/good-return/[id]/post

GET/POST  /api/store/internal-return, /api/store/internal-return/[id]
POST  /api/store/internal-return/[id]/post

GET/POST  /api/store/diesel-log, /api/store/diesel-log/[id]
GET   /api/store/diesel-logs                — alias plural

GET/POST  /api/store/asset-mgmt/assets, /api/store/asset-mgmt/assets/[id]
GET/POST  /api/store/asset-mgmt/categories, /api/store/asset-mgmt/categories/[id]
GET/POST  /api/store/asset-mgmt/issuances, /api/store/asset-mgmt/issuances/[id]
```

> The duplicate paths (`/api/store/grn` vs `/api/purchase/grn`, `/api/store/issues` vs `/api/store/material-issue`, `/api/store/transfers` vs `/api/store/stock-transfer`, `/api/store/gate-passes` vs `/api/store/gate-pass`, `/api/store/good-returns` vs `/api/store/good-return`) are an in-progress consolidation. The plural/newer paths are preferred for new tool integrations.

#### Projects (BOQ, Estimation, WO, DPR, RAB)
```
GET/POST  /api/projects/boq                          — legacy BOQ (CnBOQItem)
GET/PATCH/DELETE  /api/projects/boq/[id]
GET/POST  /api/projects/boq/[id]/items
POST  /api/projects/boq/[id]/lock
POST  /api/projects/boq/[id]/unlock
POST  /api/projects/boq/import-preview               — legacy preview
POST  /api/projects/boq/import-commit                — legacy commit

# BOQ V2 (current canonical pipeline)
GET/POST  /api/projects/[projectId]/boq              — list/create BOQ items
GET/PATCH/DELETE  /api/projects/[projectId]/boq/[itemId]
POST  /api/projects/[projectId]/boq/preview-upload   — Excel dry-run (returns full normalized rows)
POST  /api/projects/[projectId]/boq/import           — caller posts back the rows; server re-validates and persists
POST  /api/projects/[projectId]/boq/confirm          — finalize a staged batch
POST  /api/projects/[projectId]/boq/detect-columns   — Universal-mode column detection
POST  /api/projects/[projectId]/boq/lock             — freeze tenderQty + rate
POST  /api/projects/[projectId]/boq/unlock           — Super Admin override
GET   /api/projects/[projectId]/boq/template-download

GET/POST  /api/projects/dpr, /api/projects/dpr/[id]
POST  /api/projects/dpr/[id]/submit
POST  /api/projects/dpr/[id]/approve   — appends to CnBOQProgressLedger, updates BOQ V2 rollups
POST  /api/projects/dpr/[id]/post      — alternate finalize (legacy)
GET/POST  /api/projects/dpr/[id]/materials

GET/POST  /api/projects/work-orders, /api/projects/work-orders/[id]
POST  /api/projects/work-orders/[id]/submit
POST  /api/projects/work-orders/[id]/approve
POST  /api/projects/work-orders/[id]/send       — to contractor
POST  /api/projects/work-orders/[id]/complete

GET/POST  /api/projects/rab, /api/projects/rab/[id]
POST  /api/projects/rab/[id]/approve            — appends to CnBOQBillingLedger

GET/POST  /api/projects/estimation, /api/projects/estimation/[id]
POST  /api/projects/estimation/[id]/convert-to-boq

GET/POST  /api/projects/[projectId]/estimations
GET/POST  /api/estimations, /api/estimations/[id]
POST  /api/estimations/[id]/submit
POST  /api/estimations/[id]/approve

GET/POST  /api/projects/hindrance, /api/projects/hindrance/[id]
POST  /api/projects/hindrance/[id]/close

GET   /api/projects/documents                  — project docs index
```

#### Approvals
```
GET   /api/approvals/inbox                  — pending items needing the current user's approval
GET   /api/approvals/pending                — same as inbox, alternative path
GET   /api/approvals/chain                  — workflow chain config
GET   /api/approvals/rules                  — approval rules CRUD
POST  /api/approvals/rules
GET   /api/approvals/rules/[id]
PATCH /api/approvals/rules/[id]
DELETE /api/approvals/rules/[id]
GET   /api/approvals/requests               — list ApprovalRequest rows
GET   /api/approvals/requests/[id]
GET   /api/approvals/[id]/history           — full history of an approval instance
POST  /api/approvals/[id]/[action]          — perform approve/reject/return on the current step
```

#### Finance (orgId-only newer pattern)
```
GET   /api/finance/summary                  — AR/AP snapshot

GET/POST  /api/finance/invoices              — client invoices CRUD
GET/PATCH/DELETE  /api/finance/invoices/[id]
POST  /api/finance/invoices/from-rab/[rabId]   — generate invoice from approved RAB

GET/POST  /api/finance/bills                 — vendor bills CRUD
GET/PATCH/DELETE  /api/finance/bills/[id]
POST  /api/finance/bills/from-grn/[grnId]    — generate bill from approved GRN

GET/POST  /api/finance/receipts              — client receipts (collection)
GET/PATCH/DELETE  /api/finance/receipts/[id]

GET/POST  /api/finance/payments              — vendor payments
GET/PATCH/DELETE  /api/finance/payments/[id]

GET/POST  /api/finance/credit-notes
GET/PATCH/DELETE  /api/finance/credit-notes/[id]

GET/POST  /api/finance/debit-notes
GET/PATCH/DELETE  /api/finance/debit-notes/[id]

GET/POST  /api/finance/expenses
GET/PATCH/DELETE  /api/finance/expenses/[id]

GET   /api/finance/petty-cash               — petty cash ledger
GET   /api/finance/retention                — retention summary (per project / contractor)
GET   /api/finance/client-billing           — client billing rollup
GET   /api/finance/vendor-payments          — vendor payments rollup
```

#### Reports
```
GET   /api/reports/ap-aging                 — Vendor bill aging buckets
GET   /api/reports/ar-aging                 — Customer invoice aging buckets
GET   /api/reports/project-pnl              — P&L per project (revenue - cost)
GET   /api/reports/stock-valuation          — Stock value at a date
GET   /api/reports/vendor-performance       — On-time delivery, quality stats
```

#### Quality, Safety, Documents, Files
```
GET/POST  /api/quality/checklists
GET/POST  /api/quality/inspections, /api/quality/inspections/[id]

GET/POST  /api/safety/checklists
GET/POST  /api/safety/incidents, /api/safety/incidents/[id]
GET/POST  /api/safety/toolbox-talks

GET/POST  /api/documents
GET/PATCH/DELETE  /api/documents/[id]
GET   /api/documents/[id]/download

GET   /api/files/by-entity                  — list attachments for (entityType, entityId)
GET   /api/files/[id]                       — file metadata
POST  /api/files/upload-init                — presigned upload URL
POST  /api/files/upload-confirm             — finalize upload + write CnFileObject row
POST  /api/files/local-upload               — dev-only inline upload
GET   /api/files/local-download             — dev-only inline download

POST  /api/uploads                          — alternative upload entry
```

### 3c. Per-route detail (selected — most relevant to AI tool calls)

The following routes are documented in full because they're the most likely AI tool targets. Other routes follow the same pattern (auth → validate → repo call → response).

#### `GET /api/masters/projects`
```
File:               app/api/masters/projects/route.ts
Auth:               getTenantContext (Pattern A) — 401 if no session
Permissions checked: NONE (relies on tenant scope from session)
Request body:        n/a
Query params:
  search:           string (optional, filename/code/name LIKE)
  page:             number (1-indexed, optional)
  pageSize:         number (default 100, max 500)
Response shape (no pagination):
  { data: CnProject[], total: number }
Response shape (paginated):
  { data: CnProject[], total: number, page, pageSize, hasMore }
Error responses:    none — returns { data: [], total: 0 } when ctx is null
Calls audit log:    NO
Calls search index: NO
orgId isolation:    YES (filters by ctx.tenantId + ctx.orgId)
                    Additionally restricts to ctx.projectIds if user is project-restricted
Calls AI Runtime:   NO
Cache:              cachedJson(result, "medium") — 5-min HTTP Cache-Control
Notes:              The route gracefully degrades to empty list on missing auth.
                    AI Runtime tool callers WILL receive empty list if their
                    service JWT does not produce a valid TenantContext.
```

#### `POST /api/masters/projects`
```
File:               app/api/masters/projects/route.ts
Auth:               getTenantContext — 401 if missing
Permissions checked: NONE (any authenticated user can create — guard happens
                    only at the masters menu level via permissionMatrix)
Request body:
  code: string         (required, validated by validateProjectCode — alphanumeric, hyphens, max 20)
  name: string         (required)
  companyId: string    (required FK to CnCompany)
  description?: string
  projectType?: string
  clientId?: string
  departmentId?: string
  address?, city?, state?, pincode?, siteGstin?: string
  startDate?, expectedEndDate?, actualEndDate?: ISO date string
  projectValue?, budget?, purchaseLimit?: numeric string (Decimal 18,2)
  projectManagerId?: string
  status?: "active" | "inactive" (default "active")
Response (success):  201 with full CnProject record (raw shape)
Error responses:
  400 { error, code: "BAD_REQUEST" }   — validation error or missing FK
  401 { error: "Unauthenticated" }
  409 { error }                        — P2002 unique constraint (code already used)
  500 { error }                        — fallback
Calls audit log:    NO  ⚠ AI agent actions will not be logged
Calls search index: NO  ⚠ Project will not appear in search results
orgId isolation:    YES (server injects tenantId + orgId from ctx)
Calls AI Runtime:   NO
Notes:              Standard create pattern across all 19 master entities.
                    The "/api/masters/[entity]/[id]" generic route follows
                    the same shape with the entity slug in the path.
```

#### `POST /api/purchase/orders`
```
File:               app/api/purchase/orders/route.ts (520 lines — most complex route)
Auth:               getTenantContext — 401 if missing
Permissions checked: NONE in the route handler (relies on UI gating via permissionMatrix).
                    SHOULD use requirePermission("purchase.po.write") — see P0 list.
Request body (single-vendor):
  projectId: string                    (required)
  vendorId: string                     (required, OR pass vendors[])
  lines: Array<{
    itemId, poQty, unitRate,
    gstRate?, igstAmount?, cgstAmount?, sgstAmount?,
    discount?, specification?, hsnCode?, ...
  }>                                   (required, len >= 1)
  sourceIndentId?: string              (required unless isUrgentLocal=true)
  sourceRfqId?: string
  sourceRfqNumber?: string
  poDate?: ISO date                    (defaults to now)
  deliveryDate?: ISO date
  deliveryAddress?: string             (defaults to project.address)
  paymentTerms?: string                ("Net 30" → paymentTermsDays=30)
  termsTemplateId?: string             (snapshots template body at create-time)
  termsAndConditions?: string          (alternative to template)
  remarks?: string
  isUrgentLocal?: boolean              (bypasses indent chain)
  urgentLocalReason?: string
  purpose?: string
  freightCharges?: numeric string
  otherCharges?: numeric string
  contacts?: Array<{ name, mobile }>   (joined into contactPerson/contactMobile)
Request body (multi-vendor split):
  vendors: Array<{ vendorId, email?, assignedItemIds: string[] }>
  ... (everything else as above)
  // Each vendor row's assignedItemIds carries `row-N` indices into lines.
  // Server splits the submission into N per-vendor POs.
Validations (purchase-service.validatePOCreation):
  - SOURCE_INDENT_REQUIRED        unless isUrgentLocal
  - INDENT_NOT_APPROVED           if indent.status !== "approved"
  - INDENT_QTY_EXCEEDED           if any po line qty > indent qtyOpen
  - BLACKLISTED_VENDOR            if vendor.status === "blacklisted"
  - VENDOR_NOT_SELECTED, NO_LINES_ASSIGNED, SOURCE_CHAIN_MISMATCH
Response (success, single):  201 CnPurchaseOrder (raw record)
Response (success, multi):   201 { multi: true, count, records: CnPurchaseOrder[] }
Error responses:
  400 { error, code }                  — PurchaseValidationError or business error
  401 { error: "Unauthenticated" }
  404 { error: "Project not found" }
  409 { error }                        — P2002 (poNumber collision; auto-retries internally first)
  500 { error }
Calls audit log:    NO  ⚠
Calls search index: NO  ⚠
orgId isolation:    YES
Doc number:         nextProjectScopedDocNumber({ type: "po", ... }) — "PO-PROJ-FY-####"
                    wrapped in withDocNumberRetry for concurrent-create safety
Idempotency:        NOT enforced on this route (POST, body-level dedupe absent).
                    Clients should NOT retry a 5xx without a fresh request.
Calls AI Runtime:   NO
Risk class for AI:  MEDIUM_WRITE (creates a financial commitment to a vendor)
```

#### `POST /api/projects/dpr/[id]/approve`
```
File:               app/api/projects/dpr/[id]/approve/route.ts
Auth:               getTenantContext — 401 if missing; SHOULD requirePermission("dpr.approve")
Side effects (in a single Prisma transaction):
  1. CnDailyProgressReport.status → "approved"
  2. Append rows to CnBOQProgressLedger for each work-item (direction=+1)
  3. Update CnBOQItemV2 cached subDoneQty / selfDoneQty rollups
  4. CnApprovalHistory row recording the action
  5. Notification fan-out (ledger emits, projection updates inbox)
Idempotency:        Wrapped in idempotencyGuard("approve-dpr") — replays return cached response
Risk class for AI:  HIGH_RISK (mutates BOQ progress visible to billing pipeline + downstream RAB)
```

#### `GET /api/dashboard`
```
File:               app/api/dashboard/route.ts
Auth:               getTenantContext
Returns:            counts of pending PRs/Indents/POs/GRNs,
                    AP/AR snapshot (delegates to /api/finance/summary internals),
                    recent approvals needing attention.
Risk class:         READ
```

#### `GET /api/me`
```
File:               app/api/me/route.ts
Auth:               getTenantContext
Returns:            { user: { id, email, name, role, userType, modulesAssigned,
                              permissionMatrix, projectsAssigned, permissions: string[] },
                      requestId }
Use for AI:         Used by the SPA to gate UI. AI runtime can call this with a
                    service JWT to learn what permissions the actor has, but
                    the result is shaped for the UI, not for tool gating.
```

---

## Section 4: Manifest Analysis

### 4a. Manifest verbatim (apps/quikinfra/app-manifest.ts)

```typescript
export const CONSTRUCTION_EVENTS = {
  // Purchase
  PR_CREATED: 'construction.pr.created',
  PR_APPROVED: 'construction.pr.approved',
  INDENT_CREATED: 'construction.indent.created',
  INDENT_APPROVED: 'construction.indent.approved',
  PO_CREATED: 'construction.po.created',
  PO_APPROVED: 'construction.po.approved',
  GRN_CREATED: 'construction.grn.created',
  GRN_COMPLETED: 'construction.grn.completed',
  // Store
  ISSUE_CREATED: 'construction.issue.created',
  TRANSFER_INITIATED: 'construction.transfer.initiated',
  TRANSFER_RECEIVED: 'construction.transfer.received',
  GATE_PASS_CREATED: 'construction.gatepass.created',
  // Project
  BOQ_UPLOADED: 'construction.boq.uploaded',
  WO_CREATED: 'construction.wo.created',
  WO_APPROVED: 'construction.wo.approved',
  DPR_SUBMITTED: 'construction.dpr.submitted',
  DPR_APPROVED: 'construction.dpr.approved',
  RAB_GENERATED: 'construction.rab.generated',
  // Approvals
  APPROVAL_REQUESTED: 'construction.approval.requested',
  APPROVAL_COMPLETED: 'construction.approval.completed',
  APPROVAL_REJECTED: 'construction.approval.rejected',
} as const;

export const QUIKINFRA_MANIFEST = {
  appKey: 'quikinfra',
  appName: 'QuikInfra',
  appCategory: 'Construction ERP',
  appIcon: '🏗️',
  appColor: '#f97316',
  appVersion: '1.0.0',

  routes: { /* dashboard, masters, purchase, store, projects, settings — see file */ },

  featureFlags: [
    'construction.dashboard', 'construction.masters', 'construction.purchase',
    'construction.store', 'construction.projects', 'construction.boq',
    'construction.dpr', 'construction.rab', 'construction.approvals',
    'construction.reports', 'construction.diesel',
  ],

  permissionKeys: [ /* 60+ keys — see Section 4d */ ],
  eventTypes: Object.values(CONSTRUCTION_EVENTS),

  workProjectionMappings: {
    'construction.pr.created':     { workType: 'approval', statusField: 'status' },
    'construction.indent.created': { workType: 'approval', statusField: 'status' },
    'construction.po.created':     { workType: 'approval', statusField: 'status' },
    'construction.dpr.submitted':  { workType: 'approval', statusField: 'status' },
    'construction.wo.created':     { workType: 'approval', statusField: 'status' },
  },

  searchIndexMappings: {
    project:       { titleField: 'name',      subtitleField: 'code',  urlPattern: '/masters/projects/{id}' },
    item:          { titleField: 'name',      subtitleField: 'code',  urlPattern: '/masters/items/{id}' },
    vendor:        { titleField: 'name',      subtitleField: 'gstin', urlPattern: '/masters/vendors/{id}' },
    purchaseOrder: { titleField: 'poNumber',  subtitleField: 'vendor', urlPattern: '/purchase/orders/{id}' },
    grn:           { titleField: 'grnNumber', subtitleField: 'project', urlPattern: '/store/grn/{id}' },
    workOrder:     { titleField: 'woNumber',  subtitleField: 'contractor', urlPattern: '/projects/work-orders/{id}' },
  },
} as const;
```

> **Important:** the manifest does NOT follow the App Contract shape used by other QuikIT apps (no `modules: [...]`, no `entities: [{ type, isSearchable, summaryEndpoint }]` fields). The data is here in a different shape. The AI Runtime team will need either the manifest reshape, OR will need to map the existing `searchIndexMappings` keys to entity types.

### 4b. Modules declared

The manifest doesn't have an explicit `modules` array. Modules are inferred from `routes`, `permissionKeys` prefixes, and the menu catalog:

| Module ID | Module name | Sidebar route |
|---|---|---|
| dashboard | Dashboard | /dashboard |
| masters | Masters | /masters |
| purchase | Purchase & Procurement | /purchase |
| store | Store & Inventory | /store |
| projects | Project Management | /projects |
| approvals | Approvals | /approvals |
| reports | Reports | /reports |
| finance | Finance | /finance (added in canonical schema; not in manifest yet) |
| quality | Quality | /quality (no sidebar entry yet) |
| safety | Safety | /safety (no sidebar entry yet) |
| documents | Documents | /documents |
| settings | Settings | /settings |

### 4c. Entities declared

| Entity type | Module | isSearchable | Has summary endpoint? |
|---|---|---|---|
| project | masters | manifest says yes | ❌ |
| item | masters | manifest says yes | ❌ |
| vendor | masters | manifest says yes | ❌ |
| purchaseOrder | purchase | manifest says yes | ❌ |
| grn | store / purchase | manifest says yes | ❌ |
| workOrder | projects | manifest says yes | ❌ |

**Other entities the AI Runtime should treat as primary even though the manifest doesn't list them in `searchIndexMappings`:**
- purchaseRequisition, purchaseIndent, rfq
- materialIssue, stockTransfer, stockReconciliation, gatePass, goodReturn, dieselLog
- boqItem (V2), dpr, rab, estimation, hindrance
- clientInvoice, clientReceipt, vendorBill, vendorPayment, expense, creditNote, debitNote
- safetyIncident, qcInspection, employee, payroll, attendance
- approvalRequest, approvalInstance

### 4d. Complete permission catalog

From `src/lib/rbac/permissions.ts` (this file, not the manifest, is the live source — the seed runs from here). The manifest's `permissionKeys` list is **older and incomplete** and uses a different naming convention (`construction.X.Y` vs the live `module.entity.action`).

| Permission key | Module | Action | Description |
|---|---|---|---|
| boq.read | boq | read | View BOQ |
| boq.write | boq | write | Add manual BOQ item |
| boq.import | boq | import | Import BOQ from Excel |
| boq.lock | boq | lock | Lock BOQ (freezes tender data) |
| boq.unlock | boq | unlock | Unlock BOQ (Super Admin override) |
| dpr.read | dpr | read | View DPRs |
| dpr.write | dpr | write | Create/edit DPR |
| dpr.submit | dpr | submit | Submit DPR for approval |
| dpr.approve | dpr | approve | Approve DPR (posts to BOQ) |
| dpr.reverse | dpr | reverse | Reverse approved DPR |
| rab.read | rab | read | View RABs |
| rab.write | rab | write | Create/edit RAB |
| rab.submit | rab | submit | Submit RAB |
| rab.approve | rab | approve | Approve RAB (posts billing) |
| rab.pay | rab | pay | Mark RAB as paid |
| wo.read / wo.write / wo.approve / wo.close | wo | * | Work order CRUD + approve + close |
| purchase.mr.read/write/submit/approve | purchase | * | Material Requisition |
| purchase.indent.read/write/submit/approve_l1/approve_l2/approve_l3 | purchase | * | Indent (3-level approval) |
| purchase.po.read/write/approve_l1/approve_l2/dispatch/close | purchase | * | Purchase Order |
| purchase.grn.read/write/approve/reverse | purchase | * | GRN |
| store.issue.read/write/approve | store | * | Material Issue |
| store.transfer.read/write/approve | store | * | Stock Transfer |
| store.recon.read/write/approve | store | * | Stock Reconciliation |
| store.good_return.write/approve | store | * | Good Return |
| store.gate_pass.write/approve | store | * | Gate Pass |
| store.diesel.write | store | * | Diesel Log |
| quality.read/write/inspect | quality | * | Quality |
| safety.read/write | safety | * | Safety |
| safety.incident.report | safety | report | Safety incident |
| masters.read/write/delete | masters | * | All masters |
| finance.view/export/tds_config/gst_config/reconcile | finance | * | Finance-lite |
| settings.users/roles/workflows/tenants/feature_flags | settings | * | Admin config |
| reports.read/export | reports | * | Reports |
| audit.view | audit | view | Audit log |

**Field-key permissions:** None. The app does not implement per-field permission keys today.

---

## Section 5: Entity Shapes for AI Context

> **Critical caveat for the AI Runtime team:** there are **no `/api/{entity}/:id/summary` endpoints** in this app. Every detail endpoint returns the **full record shape** including audit fields. The AI Runtime will have to either (a) build summaries client-side from the full record, or (b) request that the QuikInfra team build summary endpoints (P0 below).

### Entity: `project` (CnProject)

Full record shape from `GET /api/masters/projects/{id}`:
```typescript
{
  id: string,
  orgId: string,
  // tenantId: string  // present in local schema, absent in canonical
  code: string,
  name: string,
  description: string | null,
  projectType: string | null,
  companyId: string,
  clientId: string | null,
  departmentId: string | null,
  address: string | null,
  city: string | null,
  state: string | null,
  pincode: string | null,
  siteGstin: string | null,
  startDate: ISODate | null,
  expectedEndDate: ISODate | null,
  actualEndDate: ISODate | null,
  projectValue: string | null,    // Decimal as string
  budget: string | null,          // Decimal as string
  purchaseLimit: string | null,   // Decimal as string
  projectManagerId: string | null,
  status: "active" | "inactive",
  createdAt: ISODateTime,
  updatedAt: ISODateTime,
  createdBy: string,
  updatedBy: string,
  deletedAt: ISODateTime | null,
  // included relations (when GET /api/masters/projects?include=...):
  company?: { id, name, gstin },
  client?: { id, name },
}
```

**Suggested summary shape (NOT yet implemented):**
```typescript
{
  id: string,
  displayName: string,            // "{code} — {name}"
  code: string,
  status: string,
  companyName: string,
  clientName: string | null,
  startDate: ISODate | null,
  expectedEndDate: ISODate | null,
  budget: string | null,
  url: string,                    // /masters/projects/{id}
}
```

### Entity: `purchaseOrder` (CnPurchaseOrder)

Full record shape from `GET /api/purchase/orders/{id}`:
```typescript
{
  id: string,
  orgId: string,
  poNumber: string,                      // "PO-PROJ-FY-####"
  projectId: string,
  vendorId: string,
  indentId: string | null,
  rfqId: string | null,
  poDate: ISODate,
  deliveryDate: ISODate | null,
  deliveryAddress: string | null,
  subtotal: string,                      // Decimal 18,2 as string
  taxAmount: string,
  totalAmount: string,
  freightCharges: string | null,
  otherCharges: string | null,
  advanceAmount: string | null,
  totalIGST, totalCGST, totalSGST: string | null,
  purpose: string | null,
  contactPerson: string | null,
  contactMobile: string | null,
  status: "draft" | "pending_approval" | "approved" | "sent" | "closed" | "cancelled",
  approvalId: string | null,
  approvalThresholdMet: boolean,
  paymentTermsDays: number | null,
  termsConditionId: string | null,
  termsAndConditions: string | null,
  remarks: string | null,
  isUrgentLocal: boolean,
  urgentLocalReason: string | null,
  closedAt, closedBy, closeReason: string | null,
  createdAt, updatedAt, createdBy, updatedBy, deletedAt,
  // included:
  vendor: { id, name, gstin, ... },
  project: { id, code, name },
  lines: CnPurchaseOrderLine[],
  grns: CnGoodsReceiptNote[],
}
```

**Suggested summary shape:**
```typescript
{
  id: string,
  displayName: string,            // "PO {poNumber}"
  poNumber: string,
  status: string,
  vendorName: string,
  projectName: string,
  totalAmount: string,
  poDate: ISODate,
  deliveryDate: ISODate | null,
  url: string,                    // /purchase/orders/{id}
}
```

### Entity: `grn` (CnGoodsReceiptNote)

Full record shape from `GET /api/store/grn/{id}` (or legacy `/api/purchase/grn/{id}`):
```typescript
{
  id, orgId, grnNumber, poId, projectId, vendorId,
  grnDate: ISODate,
  locationId, storageLocationId,
  supplierInvoiceNo, supplierInvoiceDate, challanNo, challanDate,
  receivedById, receivedByName, inspectedById,
  weighbridgeSlipNo, vehicleNo, ewayBillNo,
  approxInvoiceValue: string | null,
  challanAttachment: string | null,
  overallQualityStatus: "Accepted" | "Conditional" | "Rejected",
  status: "draft" | "pending_approval" | "approved" | "reversed",
  approvalId, remarks,
  createdAt, updatedAt, createdBy, updatedBy,
  // included:
  po: CnPurchaseOrder,
  project: CnProject,
  vendor: CnVendor,
  lines: CnGRNLine[],
}
```

**Suggested summary shape:**
```typescript
{
  id, displayName: "GRN {grnNumber}", grnNumber, status,
  vendorName, projectName, poNumber,
  grnDate, totalReceivedQty: number, qualityStatus: string,
  url: "/store/grn/{id}",
}
```

### Entity: `workOrder` (CnWorkOrder)

Full record shape from `GET /api/projects/work-orders/{id}`:
```typescript
{
  id, orgId, woNumber, projectId, contractorId, workCategoryId,
  title, description,
  startDate, endDate,
  totalAmount: string,
  status: "draft" | "pending_approval" | "approved" | "sent" | "in_progress" | "completed",
  approvalId, termsConditionId,
  createdAt, updatedAt, createdBy, updatedBy,
  // included:
  project, contractor,
  lines: CnWorkOrderLine[],
  rabs: CnRunningAccountBill[],
}
```

### Entity: `dpr` (CnDailyProgressReport)

```typescript
{
  id, orgId, dprNumber, projectId, reportDate,
  submittedById, weatherCondition, remarks, status, approvalId,
  createdAt, updatedAt, createdBy, updatedBy,
  // included:
  project,
  workItems: CnDPRWorkItem[],       // boq item, todayQty, cumulativeQty
  labourEntries: CnDPRLabourEntry[], // category, count, hoursWorked
  machineryEntries: CnDPRMachineryEntry[],
  materialEntries: CnDPRMaterialEntry[],
}
```

### Entity: `rab` (CnRunningAccountBill)

```typescript
{
  id, orgId, rabNumber, projectId, contractorId, woId,
  billPeriodFrom, billPeriodTo,
  previousBillAmount, currentBillAmount, cumulativeAmount,
  retentionPercent, retentionAmount, deductions, netPayable,
  status, approvalId,
  createdAt, updatedAt, createdBy, updatedBy,
  // included:
  project, contractor, workOrder,
  lines: CnRABLine[],
}
```

### Entity: `vendor` (CnVendor)

Full shape — see schema at line 2121 of canonical schema. Status values: `active | inactive | blacklisted`. Has `paymentTermsDays`, `rating`, `gstin`, `pan`, bank details.

**Suggested summary:** `{ id, displayName: name, code, gstin, status, isBlacklisted, url: "/masters/vendors/{id}" }`

### Entity: `clientInvoice` (CnClientInvoice — finance, canonical schema only)

```typescript
{
  id, orgId, invoiceNumber, customerId, projectId, rabId,
  invoiceDate, dueDate,
  subtotal, taxAmount, cgstAmount, sgstAmount, igstAmount,
  placeOfSupply, total, paidAmount,
  status: "draft" | "sent" | "partial" | "paid" | "cancelled",
  remarks,
  createdAt, updatedAt, createdBy, updatedBy, deletedAt,
}
```

---

## Section 6: Search Indexing

**`@quikit/search-sdk` is NOT integrated.** Confirmed via grep across the entire app — no imports, no calls, no index emit.

The `searchIndexMappings` block in `app-manifest.ts` declares **intent** but no code reads it. There is no:
- Search index emitter on entity create/update/delete
- Indexable text computation
- Snippet template renderer

**Entities the manifest says SHOULD be searchable (but are NOT today):**

| Entity | Title field | Subtitle field | URL pattern | Index emit on create? | Update? | Delete? |
|---|---|---|---|---|---|---|
| project | name | code | /masters/projects/{id} | ❌ | ❌ | ❌ |
| item | name | code | /masters/items/{id} | ❌ | ❌ | ❌ |
| vendor | name | gstin | /masters/vendors/{id} | ❌ | ❌ | ❌ |
| purchaseOrder | poNumber | vendor | /purchase/orders/{id} | ❌ | ❌ | ❌ |
| grn | grnNumber | project | /store/grn/{id} | ❌ | ❌ | ❌ |
| workOrder | woNumber | contractor | /projects/work-orders/{id} | ❌ | ❌ | ❌ |

**Additional entities the AI team should ask QuikInfra to index:**
contractor, customer, item, purchaseRequisition, indent, rfq, dpr, rab, estimation, materialIssue, gatePass, stockTransfer, clientInvoice, vendorBill, safetyIncident, qcInspection.

---

## Section 7: Audit Logging

**`@quikit/audit` is NOT integrated.** Confirmed via grep — no imports.

The app has its **own** audit log table (`CnAuditLog`) and a `GET /api/audit` query endpoint, but:
- **Almost no routes write to it.** Searching for `cnAuditLog.create` / `auditLog.create` across `app/api/` returns very few hits — primarily approval routes that record `CnApprovalHistory` (which is approval-specific, not generic audit).
- The append-only ledgers (`CnStockLedger`, `CnBOQProgressLedger`, `CnBOQBillingLedger`) carry domain-event history but not an "audit" view.

| Route | Action string | Before/after included? | actorType aware? | writeAuditLog called? |
|---|---|---|---|---|
| POST /api/masters/* | masters.{entity}.create | none | ❌ | ❌ |
| PATCH /api/masters/*/[id] | masters.{entity}.update | none | ❌ | ❌ |
| DELETE /api/masters/*/[id] | masters.{entity}.delete | none | ❌ | ❌ |
| POST /api/purchase/orders | purchase.po.create | none | ❌ | ❌ |
| POST /api/purchase/orders/[id]/approve | purchase.po.approve | logs to CnApprovalHistory only | ❌ | partial |
| POST /api/projects/dpr/[id]/approve | dpr.approve | logs to CnApprovalHistory + ledger | ❌ | partial |
| POST /api/store/grn/[id]/post | grn.post | ledger entry only | ❌ | ❌ |
| POST /api/finance/* | none | none | ❌ | ❌ |

**Mutations NOT audited but should be (every primary write):** every POST/PATCH/DELETE in masters, purchase, store, projects, finance.

**Approval-specific audit:** `CnApprovalHistory` exists and is written on approve/reject/return/reverse. This is the closest thing to audit the app has today, but it's scoped to approval flows and does not capture before/after diffs.

---

## Section 8: Permission Implementation

### Pattern (live):
```typescript
import { requirePermission, getTenantContext } from "@/lib/auth/context";

// Hard gate
const ctx = await requirePermission("boq.lock");
if (ctx instanceof NextResponse) return ctx;

// Soft check
const ctx = await getTenantContext();
if (!ctx) return unauthorized();
if (!hasPermission(ctx, "boq.lock")) return forbidden();
```

`hasPermission(ctx, key)` returns true when `ctx.permissions.has("*")` (super admin / tenant admin) OR `ctx.permissions.has(key)`.

### Reality: Most routes don't gate

Of the 239 routes, the `requirePermission` / `requireRole` / `requireAnyPermission` calls appear in only a small fraction. Most masters / purchase / store / project routes use bare `getTenantContext` and rely on UI-side permission gating via `permissionMatrix`. **This is a permission gap.** A holder of any valid session can call most routes regardless of role.

### Ownership checks
The route bodies do not implement "user can only see their own X" filtering. Closest equivalent:
- `ctx.projectIds` filtering — non-empty `projectsAssigned` on `CnUser` constrains list endpoints to those project IDs (see `app/api/masters/projects/route.ts`).
- Approval routes filter `pendingApproval` by current user's role/department membership.

### Module-level gates (`withOrgAuthForModule`)
Newer routes (finance, audit, documents) use `withOrgAuthForModule("finance")` from `@/lib/api/withOrgAuth`. The factory:
1. Resolves session
2. Checks user has the module assigned (`modulesAssigned.includes("finance")`) OR is super/tenant admin
3. Passes `{ orgId, userId }` to handler

This is module-coarse, not action-fine. A user who has `finance` module access can hit every finance endpoint regardless of role.

### Permission gaps (selected examples)
- `POST /api/masters/projects` — no `requirePermission("masters.write")` call.
- `POST /api/purchase/orders` — no `requirePermission("purchase.po.write")` call.
- `POST /api/projects/dpr/[id]/approve` — no `requirePermission("dpr.approve")` call.
- `POST /api/store/grn/[id]/post` — no `requirePermission("purchase.grn.approve")` call.
- `POST /api/finance/invoices` — module-gated only, not action-gated.
- `GET /api/audit` — module-gated only; no `requirePermission("audit.view")`.

---

## Section 9: org Isolation

### Pattern (live)
Pattern A routes:
```typescript
const ctx = await getTenantContext();
const list = await db.cnPurchaseOrder.findMany({
  where: { tenantId: ctx.tenantId, orgId: ctx.orgId, status: "approved" },
});
```

Pattern B routes:
```typescript
export const GET = withOrgAuth(async ({ orgId }) => {
  const list = await db.cnClientInvoice.findMany({
    where: { orgId, deletedAt: null, status: { not: "cancelled" } },
  });
});
```

The repo helpers (`src/lib/masters/*-repository.ts`, `src/lib/purchase/*-repository.ts`) take `tenantId` + `orgId` parameters explicitly so a route handler cannot accidentally drop the scope. Route bodies that call `db.cnX` directly do not have this safety net.

### Cross-org leak risks (potential)

1. **`db.cnX.findUnique({ where: { id } })`** — Prisma's `findUnique` requires a unique key. When the unique key is just `id` (cuid), the call **does not** automatically scope by orgId. CLAUDE.md flags this: "A `findUnique({ where: { id } })` from a route is a tenant leak."

   Selected hits (need verification by AI team or a security pass):
   - `app/api/purchase/orders/[id]/route.ts` — verify orgId in WHERE
   - `app/api/projects/[projectId]/boq/route.ts` — verify
   - Any route using `findUnique({ where: { id } })` without an orgId WHERE.

2. **JIT provision (`src/lib/auth/jit-provision.ts`)** — fetches central `auth.User` by id and writes `CnUser`. The orgId is taken from session, so this is safe; but the `notFoundInCentral` branch (line 99-100, the user's selected lines) does NOT include an explicit org check on the central user — relies on the session trust.

3. **`/api/audit` GET** — filters by `orgId` from session, but `entityId` is user-supplied. A user could pass any `entityId` and see audit rows for entities in their own org. Cross-org leakage is not possible (orgId filter applied), but cross-entity peek inside the org is.

### deletedAt filtering

Inconsistent. Newer (Pattern B / finance) routes uniformly add `deletedAt: null`. Older (Pattern A / masters / purchase) routes typically rely on `status !== 'inactive'` but do NOT filter by `deletedAt`. Some routes filter neither.

**Recommendation for AI team:** when calling list endpoints expect to receive both active AND soft-deleted rows from older endpoints. Filter client-side until the inconsistency is resolved.

---

## Section 10: Internal Endpoints

```
POST /api/internal/seed-fields           — NOT IMPLEMENTED
GET  /api/internal/manifest              — NOT IMPLEMENTED
```

The app exposes **no `/api/internal/*` routes**. There is no `x-internal-secret` middleware, no service-JWT verification, and no field-template seeder.

The only "internal-ish" routes are:
- `POST /api/debug/mail-test` — dev-only SMTP smoke test, no special auth.

For AI Runtime integration, the team will need to add at minimum:
- `GET /api/internal/manifest` — return the manifest + permission catalog over a service-JWT-gated route.
- `POST /api/internal/seed-fields` — if the AI Runtime expects field-template seeding (currently the app has no field templates).

---

## Section 11: AI Runtime Tool Compatibility

### 11a. Suggested tools (READ class)

| Endpoint | Tool name | Permission needed | Risk class | Input | Output | Ready for AI? |
|---|---|---|---|---|---|---|
| GET /api/masters/projects?search= | list_projects | masters.read (today: none) | READ | `search?: string, page?: number` | `{ data, total }` | partially — no auth gate |
| GET /api/masters/projects/{id} | fetch_project | masters.read | READ | `id` | full CnProject | ❌ no summary endpoint |
| GET /api/masters/items?search= | list_items | masters.read | READ | search | items list | ⚠ needs summary |
| GET /api/masters/vendors?search= | list_vendors | masters.read | READ | search | vendors list | ⚠ needs summary |
| GET /api/purchase/orders?status=&projectId= | list_purchase_orders | purchase.po.read | READ | status, projectId, search | POs list | ⚠ no `/summary` |
| GET /api/purchase/orders/{id} | fetch_purchase_order | purchase.po.read | READ | id | full PO with lines | ⚠ no `/summary` |
| GET /api/store/grn?status= | list_grns | purchase.grn.read | READ | status, projectId | GRN list | ⚠ no `/summary` |
| GET /api/store/grn/{id} | fetch_grn | purchase.grn.read | READ | id | full GRN | ⚠ no `/summary` |
| GET /api/projects/dpr?projectId= | list_dprs | dpr.read | READ | projectId | DPR list | ⚠ no `/summary` |
| GET /api/projects/dpr/{id} | fetch_dpr | dpr.read | READ | id | full DPR with all entries | ⚠ no `/summary` |
| GET /api/finance/summary | fetch_finance_summary | finance.view | READ | (none) | AR/AP snapshot | ✅ already small |
| GET /api/finance/invoices/{id} | fetch_invoice | finance.view | READ | id | full invoice | ⚠ no `/summary` |
| GET /api/store/stock-balance?projectId=&itemId= | check_stock | store.recon.read | READ | projectId, itemId | balances | ✅ usable |
| GET /api/audit?entityType=&entityId= | fetch_audit | audit.view | READ | entityType, entityId | audit rows | ✅ but mostly empty |
| GET /api/me | fetch_me | (any auth) | READ | (none) | actor + perms | ✅ usable |
| GET /api/dashboard | fetch_dashboard | (any auth) | READ | (none) | KPI snapshot | ✅ usable |
| GET /api/reports/ap-aging | report_ap_aging | reports.read | READ | asOfDate? | aging buckets | ✅ usable |
| GET /api/reports/ar-aging | report_ar_aging | reports.read | READ | asOfDate? | aging buckets | ✅ usable |
| GET /api/reports/project-pnl | report_project_pnl | reports.read | READ | projectId | P&L | ✅ usable |
| GET /api/reports/stock-valuation | report_stock_valuation | reports.read | READ | projectId, asOfDate | valuation | ✅ usable |

### 11b. Suggested tools (WRITE class)

| Endpoint | Tool name | Permission | Risk class | Notes |
|---|---|---|---|---|
| POST /api/masters/projects | create_project | masters.write | SOFT_WRITE | needs perm gate added |
| POST /api/masters/items | create_item | masters.write | SOFT_WRITE | needs perm gate |
| POST /api/masters/vendors | create_vendor | masters.write | SOFT_WRITE | check duplicate-by-GSTIN before create |
| POST /api/purchase/requisitions | create_purchase_requisition | purchase.mr.write | SOFT_WRITE | low-consequence (PR is draft) |
| POST /api/purchase/requisitions/{id}/submit | submit_pr | purchase.mr.submit | SOFT_WRITE | starts approval chain |
| POST /api/purchase/orders | create_purchase_order | purchase.po.write | **MEDIUM_WRITE** | financial commitment |
| POST /api/purchase/orders/{id}/approve | approve_po | purchase.po.approve_l1/l2 | **HIGH_RISK** | financial commitment, sends to vendor |
| POST /api/purchase/orders/{id}/send | send_po | purchase.po.dispatch | **HIGH_RISK** | external email to vendor |
| POST /api/store/grn/{id}/post | post_grn | purchase.grn.approve | **MEDIUM_WRITE** | inward stock movement (ledger) |
| POST /api/store/issues | create_issue | store.issue.write | SOFT_WRITE | draft only |
| POST /api/store/issues/{id}/approve | approve_issue | store.issue.approve | **MEDIUM_WRITE** | deducts stock |
| POST /api/projects/dpr | create_dpr | dpr.write | SOFT_WRITE | draft |
| POST /api/projects/dpr/{id}/approve | approve_dpr | dpr.approve | **HIGH_RISK** | posts BOQ progress, irreversible without dpr.reverse |
| POST /api/projects/rab/{id}/approve | approve_rab | rab.approve | **HIGH_RISK** | financial billing posting |
| POST /api/finance/invoices | create_invoice | finance.view + module access | **MEDIUM_WRITE** | books AR |
| POST /api/finance/invoices/from-rab/{rabId} | invoice_from_rab | finance.view | **MEDIUM_WRITE** | derived |
| POST /api/finance/payments | create_vendor_payment | finance.view | **HIGH_RISK** | books AP outflow |
| POST /api/finance/receipts | create_client_receipt | finance.view | **MEDIUM_WRITE** | books AR inflow |
| POST /api/projects/[projectId]/boq/import | import_boq | boq.import | **HIGH_RISK** | wholesale change to project scope |
| POST /api/projects/[projectId]/boq/lock | lock_boq | boq.lock | SOFT_WRITE | freezes data |
| POST /api/safety/incidents | report_incident | safety.incident.report | SOFT_WRITE | no external comms |

### 11c. Blockers for AI tool execution

**Per route, before the AI Runtime can call them safely:**

1. **No service-JWT support.** The auth context resolver (`getTenantContext`) handles only:
   - NextAuth session cookie
   - `x-test-role` header (dev only)
   - DEMO_MODE fallback
   It does NOT handle a service JWT carrying `actingAs: "ai_agent" | "user"` and `actingAgentId`. **This is a P0 blocker for every tool.**

2. **No `actingAs` propagation.** No code anywhere reads or writes `actingAs` or `actingAgentId`. Audit log rows would show only the `userId` regardless of whether a human or AI agent triggered the action.

3. **No summary endpoints.** Every fetch tool will return the full record (including nested lines + audit fields), bloating the AI's context window.

4. **Permission gating missing on most write routes.** Even with a service JWT, the AI Runtime cannot rely on the route to enforce permissions; it must check permissions client-side via `/api/me` first.

5. **Inconsistent response envelopes.** The tool executor must handle 4 different shapes (`{data,total}`, `{success,data}`, `{ok,data}`, raw record). Either standardize or have the executor branch on response shape.

6. **No idempotency on most mutating routes.** Only a handful of routes (BOQ pipeline, some approvals) wrap in `idempotencyGuard`. Most POSTs do not honor an `Idempotency-Key` header. Retries on 5xx may double-write.

---

## Section 12: Planned AI Use Cases

The QuikInfra app does **not currently call the AI Runtime**. There is no `INTERNAL_AI_RUNTIME_URL` env var, no `@quikit/ai-sdk` dep, no AI-related code paths. The CLAUDE.md mentions BOQ import work and approval flows but no AI features.

**Possible AI use cases (not yet built — for AI team's planning):**

| Use case string | Description | Output type | Entity | Status |
|---|---|---|---|---|
| project.summary | Summarize a project (status, progress, key contractors, recent DPRs) | text | Project | planned |
| project.budget_health | Assess budget vs spend, flag overruns | text + structured | Project | planned |
| po.next_action | Suggest next action on a PO (chase delivery, escalate, close) | text | PO | planned |
| po.vendor_check | Pre-flight: vendor blacklist + payment-history flag at PO time | structured | PO | planned |
| grn.qc_summary | Roll up quality status across recent GRNs | text | GRN/Project | planned |
| dpr.weekly_summary | Roll up the week's DPRs into a stakeholder report | text | Project | planned |
| dpr.anomaly_detection | Flag DPRs whose qty looks inconsistent with historical pace | structured | DPR | planned |
| rab.draft_from_dpr | Generate draft RAB lines from approved DPRs in a period | json | RAB/Project | planned |
| boq.extract_from_excel | Already done in code; AI assist on column mapping for Universal mode | structured | BOQItemV2 | planned |
| invoice.draft_from_rab | (already a route) — AI could enrich with reminder text for buyers | text | Invoice | planned |
| safety.incident_report_draft | Draft incident report from short prompt | text | SafetyIncident | planned |
| audit.summary | Summarize audit trail of an entity for compliance | text | any | planned |

**Suggested `contextData` for each use case:** the AI Runtime should fetch the entity record + a small set of related records (lines, recent activity, related approval status). See Section 13.

---

## Section 13: Entity Relationships Relevant to AI

### 13a. Common views-together pairings

| Primary | Commonly viewed with |
|---|---|
| Project | Active POs, recent GRNs, in-flight DPRs, RABs, stock balance per location |
| PO | Source indent, source RFQ, vendor master, all GRNs against this PO, related vendor bills |
| GRN | Parent PO, vendor, project, location, post-status (whether the stock ledger entry was made) |
| WO | Project, contractor, all RABs against this WO, BOQ items linked |
| DPR | Project, BOQ items it touched, materials consumed, machinery hours |
| RAB | WO, project, contractor, line items vs BOQ V2, invoice generated from it |
| Vendor | All POs (last 90d), GRNs, bills outstanding, payment history, blacklist status |
| Customer | Projects, invoices outstanding, receipts |

### 13b. Suggested context for each AI use case

**`project.summary` should receive:**
```
- Project record (CnProject)
- Latest 5 DPRs (CnDailyProgressReport with workItems)
- Active POs count + total value (CnPurchaseOrder where status=approved, deliveryDate>=now-30d)
- Active WOs count
- BOQ V2 progress: scopeQty / billedQty per category (rolled up)
- AR: invoices outstanding for this customer (CnClientInvoice where customerId=clientId)
- Stock value at sites for this project (CnStockBalance × CnItem.standardRate)
- Recent safety incidents (CnSafetyIncident where projectId)
```

**`po.next_action` should receive:**
```
- PO record + lines
- Vendor (CnVendor.rating, paymentTermsDays, blacklistReason)
- All GRNs against this PO (received vs pending qty rollup)
- Outstanding vendor bill against this PO
- Days since deliveryDate (for "delayed" detection)
- T&Cs body (for context on penalties)
```

### 13c. Sensitive fields that MUST NEVER be sent to the AI

- `CnUser.passwordHash` — scrypt salt:hash; never read into context
- `CnDemoUser.passwordHash` — same
- `CnUser.inviteToken` — bearer token equivalent
- `QuikitUser.password` — central auth password column (mirror table is read-only but field exists)
- `CnIdempotencyKey.key` / `bodyHash` — request-level secrets
- Bank account details on masters:
  - `CnVendor.bankAccountNo`, `CnVendor.bankIfsc`
  - `CnContractor.accountNo`, `CnContractor.ifscCode`
  - `CnCustomer.accountNumber`, `CnCustomer.ifscCode`
  - `CnCompany.accountNo`, `CnCompany.ifscCode`
  - `CnBank.accountNo`, `CnBank.ifscCode`
  > These are operational data needed for downstream payment generation but should not flow into AI prompts unless the use case explicitly requires them (e.g. a payment-prep AI tool).
- Free-text remarks containing PII (names, phone numbers) — sanitize at the AI Runtime layer.
- Internal cost / margin data — `CnBOQItem.workingRate` vs `contractRate` (margin disclosure to a contractor-facing AI feature would leak commercial info).
- `CnSafetyIncident.injuredPersons` — may contain names + medical info; route through redaction.

---

## Section 14: Field Templates

The manifest has **no `fieldTemplates` block**. The app does not implement field templates; every entity's field set is fixed at the Prisma schema level.

**Org-customisable fields:** none — there is no per-org field renaming or enum extension UI.

**Fixed enums (relevant for AI prompt building):**

| Entity | Field | Allowed values |
|---|---|---|
| CnPurchaseOrder | status | draft \| pending_approval \| approved \| sent \| closed \| cancelled |
| CnGRN | status | draft \| pending_approval \| approved \| reversed |
| CnGRN.lines | qualityStatus | pending \| accepted \| rejected \| conditional |
| CnGRN | overallQualityStatus | Accepted \| Conditional \| Rejected |
| CnDPR | status | draft \| pending_approval \| approved \| rejected \| reversed |
| CnRAB | status | draft \| pending_approval \| approved \| paid |
| CnVendor | status | active \| inactive \| blacklisted |
| CnClientInvoice | status | draft \| sent \| partial \| paid \| cancelled |
| CnVendorBill | status | draft \| approved \| partial \| paid \| cancelled |
| CnClientReceipt | mode | cash \| cheque \| bank \| upi \| other |
| CnLocation | type | site \| warehouse \| head_office \| yard |
| CnGatePass | type | inward \| outward \| returnable \| non_returnable |
| CnStockLedger | transactionType | grn \| issue \| return_vendor \| return_internal \| transfer_out \| transfer_in \| reconciliation_adj \| opening_balance |
| CnApprovalWorkflow | entityType | purchase_requisitions \| purchase_indents \| purchase_order \| grn \| work_order \| dpr \| stock_reconciliation \| good_return |
| CnApprovalHistory | action | approve \| reject \| return \| reverse |
| CnAuditLog | action | create \| update \| delete \| approve \| reject \| reverse \| status_change |

These should be passed into the AI's prompt as constrained-enum hints whenever it generates structured output.

---

## Section 15: Pagination and Filtering

### Pagination type
**Page-number based.** Cursor pagination is NOT used.

### Pagination parameters
```
?page=     1-indexed (defaults to 1)
?pageSize= rows per page, default 100, max 500 (clamped server-side)
```

When neither param is present, the route returns ALL rows (legacy `{ data, total }` shape). When at least one is present, the route returns the paginated envelope `{ data, total, page, pageSize, hasMore }`.

### Filter parameters per entity (from sampled routes — most lists support these)

```
GET /api/masters/projects
  ?search=string             (fuzzy match on code, name, city)

GET /api/masters/items
  ?search=string
  ?groupId=string
  ?status=active|inactive

GET /api/masters/vendors
  ?search=string
  ?status=active|inactive|blacklisted
  ?vendorType=string

GET /api/purchase/orders
  ?status=draft|pending_approval|approved|sent|closed|cancelled
  ?search=string             (poNumber, vendor name)
  ?projectId=string
  ?vendorId=string  (varies by route)

GET /api/purchase/indents
  ?status, ?projectId, ?search

GET /api/store/grn
  ?status, ?projectId, ?vendorId, ?poId

GET /api/projects/dpr
  ?projectId, ?status, ?reportDate (ISO date)

GET /api/projects/rab
  ?projectId, ?contractorId, ?woId, ?status

GET /api/finance/invoices
  ?customerId, ?projectId, ?status, ?fromDate, ?toDate

GET /api/finance/bills
  ?vendorId, ?projectId, ?status, ?fromDate, ?toDate
```

### Sort parameters
**Most list endpoints don't accept sort params.** Server-side default ordering (visible from the schema's composite indexes):
- POs: `createdAt DESC` then by `poDate DESC`
- DPRs: `reportDate DESC, createdAt DESC`
- GRNs: `grnDate DESC`
- RABs: `createdAt DESC`
- Approvals: `requestedAt DESC`
- Stock ledger: `transactionDate DESC, createdAt DESC`

A `?sortBy` / `?sortOrder` convention is NOT implemented.

### Response envelope (paginated)
```json
{
  "data": [...],
  "total": 137,
  "page": 1,
  "pageSize": 100,
  "hasMore": true
}
```

Older routes that haven't migrated still return:
```json
{ "data": [...], "total": 137 }
```

---

## Section 16: Error Response Shapes

The app has at least three error envelopes in active use:

**Legacy (most routes):**
```json
{ "error": "Vendor is required.", "code": "VENDOR_NOT_SELECTED" }
```

**Newer routes (`withListRoute`/`withMutationRoute`):**
```json
{ "ok": false, "error": "...", "code": "VALIDATION", "details": {...}, "requestId": "req_abc" }
```

**Pattern B (finance / audit):**
```json
{ "success": false, "error": "..." }
```
(Note: I confirmed only the success path; error path inferred. Some `withOrgAuthForModule` failures may return the legacy `{ error, code }`.)

### Error codes used (from grep across the codebase)

| HTTP status | Code | When |
|---|---|---|
| 400 | BAD_REQUEST | generic validation failure |
| 400 | VALIDATION | newer DomainError shape |
| 400 | VENDOR_NOT_SELECTED | PO create with no vendor |
| 400 | NO_LINES_ASSIGNED | PO multi-vendor split has no lines |
| 400 | SOURCE_INDENT_REQUIRED | non-urgent PO with no indent |
| 400 | SOURCE_CHAIN_MISMATCH | RFQ + indent disagree |
| 400 | INDENT_NOT_APPROVED | source indent not L3-approved |
| 400 | INDENT_QTY_EXCEEDED | PO line qty > indent qtyOpen |
| 400 | BLACKLISTED_VENDOR | vendor.status='blacklisted' |
| 400 | EXCEEDS_TENDER | BOQ override needed |
| 400 | INVALID_BODY | empty/non-JSON body |
| 401 | UNAUTHORIZED | no valid session |
| 403 | FORBIDDEN | missing permission |
| 404 | NOT_FOUND | entity not in tenant |
| 409 | CONFLICT (or no code) | P2002 unique violation |
| 409 | IDEMPOTENCY_BODY_MISMATCH | retry with same key + different body |
| 422 | rare | not commonly used |
| 429 | (none) | no rate-limit middleware |
| 500 | (varies) | catch-all |

---

## Section 17: Rate Limits

**No rate limiting middleware is configured.** Confirmed: no imports of any rate-limit library, no in-memory or Redis-backed limiter, no per-route limit declarations. Every endpoint accepts unlimited concurrent requests up to whatever Vercel / the Node process can handle.

| Route | Limit | Window |
|---|---|---|
| any | none | none |

The AI Runtime tool executor MUST self-throttle when calling this app — particularly on:
- `POST /api/projects/[projectId]/boq/preview-upload` (parses Excel, can take 5–15s)
- `POST /api/purchase/orders` (can fan out to N per-vendor POs, each with item lookups)
- `GET /api/store/stock-ledger` (can return very large rowsets if no `?fromDate` is passed)
- `GET /api/audit?limit=500` (capped at 500 server-side, but can be issued repeatedly)

When the AI Runtime hits any error and retries, there is no 429 to back off on. Use exponential backoff on 5xx instead.

---

## Section 18: Environment Variables

There is **no `.env.example`** in the repo. Only a `.env.local` exists, which mixes dev secrets and config. The variables it references:

```
DATABASE_URL                — Postgres connection (required)
DATABASE_URL_DIRECT         — direct DB URL (for migrations / Prisma client)
NEXTAUTH_SECRET             — JWT signing key
NEXTAUTH_URL                — http://localhost:3004 in dev
NEXT_PUBLIC_AUTH_URL        — central auth UI
NEXT_PUBLIC_SUPER_ADMIN_URL — super-admin panel
QUIKIT_URL / NEXT_PUBLIC_QUIKIT_URL — quikit central app
SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / MAIL_FROM
                            — invite + notification emails
QUIKIT_CLIENT_ID            — must equal "quikinfra" (Mode-A SSO)
QUIKIT_CLIENT_SECRET        — Mode-A SSO secret
LOG_LEVEL                   — info | debug | warn | error
FEATURE_AI_INSIGHTS         — false (toggle, not used yet)
FEATURE_POWER_OF_ONE        — true
FEATURE_SLACK_INTEGRATION   — false
AUTH_DEMO_MODE              — true (default in dev) — bypasses NextAuth
NODE_ENV                    — used to gate DEMO_MODE
APP_RELEASE / npm_package_version — surfaced in /api/health
```

### 18a. Required for basic operation
| Variable | Purpose |
|---|---|
| DATABASE_URL | Postgres |
| NEXTAUTH_SECRET | session JWT |
| NEXTAUTH_URL | session cookie + callback |

### 18b. Required for AI integration (NOT YET USED)
None today. Once AI Runtime is wired, expect to add:
| Variable | Purpose |
|---|---|
| `INTERNAL_AI_RUNTIME_URL` | base URL of the AI Runtime |
| `AI_RUNTIME_SERVICE_JWT_SECRET` | secret for verifying inbound service JWTs |
| `INTERNAL_API_SECRET` | bearer secret for `/api/internal/*` routes once those exist |

### 18c. Optional / feature-gated
| Variable | Feature |
|---|---|
| FEATURE_AI_INSIGHTS | placeholder for future AI pipeline |
| FEATURE_POWER_OF_ONE | currently true; routing/UX flag |
| FEATURE_SLACK_INTEGRATION | not implemented |

### 18d. Missing from `.env.example` that should be there
**Everything** — there is no `.env.example` to update. This file should be authored by the QuikInfra team and committed. Suggested contents:
```
DATABASE_URL=
DATABASE_URL_DIRECT=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3004
NEXT_PUBLIC_AUTH_URL=
NEXT_PUBLIC_SUPER_ADMIN_URL=
QUIKIT_URL=
NEXT_PUBLIC_QUIKIT_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
QUIKIT_CLIENT_ID=quikinfra
QUIKIT_CLIENT_SECRET=
LOG_LEVEL=info
FEATURE_AI_INSIGHTS=false
FEATURE_POWER_OF_ONE=true
FEATURE_SLACK_INTEGRATION=false
AUTH_DEMO_MODE=true
# (after AI integration)
# INTERNAL_AI_RUNTIME_URL=
# AI_RUNTIME_SERVICE_JWT_SECRET=
# INTERNAL_API_SECRET=
```

---

## Section 19: Dependencies

From `apps/quikinfra/package.json`:

### Platform packages currently used
| Package | Version | Used? |
|---|---|---|
| `@quikit/auth` | * | Yes — context resolution (but NOT middleware factory; app has custom middleware.ts) |
| `@quikit/database` | * | Yes — Prisma client + canonical schema |
| `@quikit/shared` | * | Yes — small constants / types |
| `@quikit/ui` | * | Yes — design system |
| `@quikit/audit` | — | **Not installed** |
| `@quikit/ai-sdk` | — | **Not installed** |
| `@quikit/search-sdk` | — | **Not installed** |

### Other dependencies
- `@tanstack/react-query` ^5.28
- `next` 14.0.4
- `next-auth` ^4.24
- `nodemailer` ^7.0
- `react` ^18.2
- `zod` ^3.22

### Platform packages needed but missing
- `@quikit/audit` — for the audit trail story (Section 7).
- `@quikit/search-sdk` — for the index emit + search story (Section 6).
- `@quikit/ai-sdk` — once AI Runtime calls start.
- A standard middleware factory `@quikit/auth/middleware` that returns the same `createMiddleware()` shape used elsewhere — currently the app has a hand-rolled middleware that diverges from the QuikIT contract.

---

## Section 20: What the AI Team Needs You to Change

### P0 — Required before any AI tool can call this app

- [ ] **Service-JWT authentication.** Update `src/lib/auth/context.ts` `getTenantContext()` to recognize a service-JWT-bearing request (`Authorization: Bearer <jwt>`), parse `actingAs` (`user` | `ai_agent`), `actingAgentId`, `actingUserId`, and build a TenantContext with the user's resolved permissions PLUS those metadata fields.
- [ ] **`actingAs` propagation through audit + history.** Every `CnApprovalHistory.actionById`, `CnAuditLog.userId`, ledger `createdBy` row should additionally carry `actorType` (currently no column) and `actingAgentId`. Schema migration required: add `actorType String?`, `actingAgentId String?` to `CnApprovalHistory`, `CnAuditLog`, `CnStockLedger`, `CnBOQProgressLedger`, `CnBOQBillingLedger`.
- [ ] **`/api/internal/manifest`.** Implement. Return the manifest + permission catalog reshaped into the App Contract format the AI Runtime expects (modules, entities with `isSearchable` and `summaryEndpoint`).
- [ ] **Summary endpoints for primary entities.** At minimum: `Project`, `PurchaseOrder`, `GRN`, `WorkOrder`, `DPR`, `RAB`, `Vendor`, `Customer`, `ClientInvoice`, `VendorBill`. Return `{ id, displayName, status, ...3-5 key fields, url }`.
- [ ] **Tenant scope on every `findUnique({ where: { id } })`.** Audit every route handler and repo helper. Replace `findUnique` with `findFirst({ where: { id, orgId } })` everywhere.
- [ ] **Standardize the response envelope.** Pick one of `{ ok, data }` or `{ success, data }` and migrate all routes. Update repo + route wrappers accordingly.
- [ ] **Add `.env.example`.** Without it, the AI Runtime team cannot reliably bootstrap a local instance.

### P1 — Required for specific AI use cases to work

- [ ] **Permission gates on every mutating route.** Add `requirePermission(...)` to every POST/PATCH/DELETE in masters, purchase, store, projects, finance.
- [ ] **`@quikit/search-sdk` integration.** Emit index events on create/update/delete for: project, item, vendor, contractor, customer, purchaseOrder, indent, rfq, grn, workOrder, dpr, rab, materialIssue, gatePass, stockTransfer, clientInvoice, vendorBill, safetyIncident, qcInspection.
- [ ] **`@quikit/audit` integration.** Replace ad-hoc `CnAuditLog` writes (the few that exist) with `writeAuditLog({ entityType, entityId, action, actorType, actingAgentId, before, after })`. Add the call to every primary mutation.
- [ ] **Idempotency on every mutation.** Wrap every POST/PATCH route in `idempotencyGuard(req, ctx, "<route-name>")` or document explicitly which routes are safe to retry.
- [ ] **Module gate parity.** Old (Pattern A) routes don't enforce `modulesAssigned`. Add the check or migrate to `withOrgAuthForModule`.
- [ ] **Sort + filter standardization.** Add `?sortBy=`/`?sortOrder=` to every list endpoint and document the allowed values.
- [ ] **Rate limiting.** Add per-org rate limits on POST routes — at minimum: `purchase/orders`, `purchase/grn`, `projects/dpr`, `projects/rab`, `finance/*`. The AI Runtime can otherwise trigger thundering-herd writes.
- [ ] **Drop the local `prisma/schema.prisma`** in `apps/quikinfra/prisma/` or sync it with the canonical shared schema. The dual-schema state is confusing for any tooling that walks the repo.

### P2 — Required for full audit trail of AI actions

- [ ] **`@quikit/audit` writes carry `actorType: ctx.actingAs` and `actingAgentId: ctx.actingAgentId`** on every mutation.
- [ ] **`CnApprovalHistory` rows** capture `actorType` + `actingAgentId` so an AI-initiated approval is distinguishable from a human one in the inbox UI.
- [ ] **Ledger rows (`CnStockLedger`, `CnBOQProgressLedger`, `CnBOQBillingLedger`)** carry `actorType` + `actingAgentId`.
- [ ] **`CnIdempotencyKey`** capture both the human user and the agent so retried tool calls reconstruct correctly.

### P3 — Recommended improvements (not blocking)

- [ ] **Remove route-path duplicates** (`/api/store/grn` vs `/api/purchase/grn`, `/api/store/issues` vs `/api/store/material-issue`, etc.). The duplicates fragment the AI tool catalog.
- [ ] **Cursor pagination** for the stock ledger and audit log. Page-number on a 100k+ row table is slow.
- [ ] **Response caching headers** on more routes — only masters use `cachedJson`. Reports + summary endpoints are good candidates.
- [ ] **OpenAPI / JSON Schema spec.** Without it, the AI Runtime tool definitions have to be hand-authored. A generator that reads each route's body validators (Zod schemas) would close this gap.
- [ ] **Consolidate the manifest** into the App Contract shape with `modules: [...]`, `entities: [...]`, `permissions: [...]`. The current shape mixes `routes`, `featureFlags`, `permissionKeys`, and `searchIndexMappings` in a non-standard way.

---

## Section 21: Data the AI Runtime Will Need to Read

### For `project.summary`:
```
GET /api/masters/projects/{id}                          — the project
GET /api/projects/dpr?projectId={id}&pageSize=10        — recent DPRs
GET /api/purchase/orders?projectId={id}&status=approved — active POs
GET /api/projects/work-orders?projectId={id}            — WOs
GET /api/projects/rab?projectId={id}                    — RABs
GET /api/projects/[projectId]/boq                       — BOQ progress (V2)
GET /api/store/stock-balance?projectId={id}             — stock per location/item
GET /api/finance/invoices?projectId={id}&status=sent    — outstanding AR
GET /api/safety/incidents?projectId={id}                — recent safety
```

### For `po.next_action`:
```
GET /api/purchase/orders/{id}                           — the PO
GET /api/masters/vendors/{vendorId}                     — vendor (rating, blacklist)
GET /api/store/grn?poId={id}                            — received GRNs
GET /api/finance/bills?poId={id}                        — vendor bills opened against PO
```

### For `dpr.weekly_summary`:
```
GET /api/projects/dpr?projectId={id}&fromDate=...&toDate=... 
                                                        — needs filter params not yet implemented
GET /api/projects/[projectId]/boq                       — to know scope vs done
```
> ⚠ The DPR list endpoint does NOT currently accept `fromDate`/`toDate` query params. The AI Runtime would need to fetch all DPRs and filter client-side OR the team should add the date-range filter (P1).

### For `rab.draft_from_dpr`:
```
GET /api/projects/dpr?projectId=&status=approved        — approved DPRs in window
GET /api/projects/work-orders?projectId=                — to map DPR work to WO lines
GET /api/projects/[projectId]/boq                       — rates for billing
POST /api/projects/rab                                  — create the draft
```

### Endpoints needed that DON'T exist yet
- `GET /api/projects/dpr?fromDate=&toDate=` — date filtering on DPR list.
- `GET /api/projects/{id}/progress-snapshot` — single endpoint that returns the rolled-up BOQ progress + recent DPRs + active POs (avoids the AI making 5–8 calls).
- `GET /api/{entity}/{id}/summary` — for every primary entity.
- `GET /api/audit/{entityType}/{entityId}` — pretty-printed entity history (today's `/api/audit?entityType=&entityId=` works but is unstructured).
- `GET /api/internal/manifest` — App Contract shape.

---

## Section 22: Anything Else the AI Team Should Know

### 22a. Auth quirks
- **`AUTH_DEMO_MODE=true` in dev returns a wildcard super-admin context unconditionally.** Any tool call against a dev instance with no session will look like it's authorized as `platform_super_admin`. This will mask permission bugs. The AI Runtime team should either set `AUTH_DEMO_MODE=false` for testing OR pass an `x-test-role: <role>` header to scope down.
- **`x-test-role` header is a dev-only impersonation channel.** It lets the test suite (and, accidentally, any caller) build a non-admin TenantContext without a session. Production gates this off via `NODE_ENV` check. The AI Runtime should NOT rely on this header in any environment.
- **Stale-JWT detection** in `getTenantContext` — a deactivated user with a valid JWT cookie still gets rejected because the resolver re-verifies `status='active'` against `CnUser` and `CnDemoUser`. AI service tokens won't have this issue but the implementation is good to know.
- **Two user tables** (`CnUser` + `CnDemoUser`) are both checked at session resolution. The "real" tenant-invited table is `CnUser`. `CnDemoUser` exists for the seeded demo accounts (amit/priya/etc.).
- **JIT provision** in `src/lib/auth/jit-provision.ts` writes a `CnUser` row on first authenticated request from a central-SSO-only user. The orgId is taken from the central user's tenant. The selected lines (99-100) handle the "user not found in central auth" branch — this can happen if the central deletes a user but the app still has a valid signed JWT. The route returns null and the SPA signs out.

### 22b. Service vs user call divergence
Today, no route differentiates service from user calls. Every authenticated request is treated as a user. Once a service JWT is implemented, expect the team will need to:
- Skip module-assignment checks for service calls (a service JWT impersonating an admin should not be blocked by `modulesAssigned`).
- Skip "must change password" forced redirect.
- Carry through to audit log writes.

### 22c. Planned schema migrations
Per CLAUDE.md and recent commits:
- Drop the legacy `apps/quikinfra/prisma/schema.prisma` once routes fully migrate to the canonical shared schema.
- Migrate all `tenantId + orgId` filtering to `orgId`-only.
- Consolidate route path duplicates listed in Section 3b.
- Wire reject/return flows into DPR + RAB approval routes (currently open).
- Fix 8 pre-existing BOQ-import test failures (not related to AI).

### 22d. Performance concerns
- **`POST /api/projects/[projectId]/boq/preview-upload`** — parses entire Excel sheets server-side (SheetJS). Real-world files reach 10–20 MB and 5,000+ rows. Cold-start can take 10–15s. The AI Runtime should not chain other tool calls after this without a timeout buffer.
- **`POST /api/purchase/orders` multi-vendor split** — N vendor rows = N PO inserts in a tight loop, not a single `$transaction`. Failures partway through can leave a partial set of POs created. Idempotency is NOT honored. Don't retry blindly.
- **`GET /api/store/stock-ledger`** — append-only table, can return very large rowsets. The AI Runtime MUST pass `?fromDate=` to bound the result.
- **`GET /api/audit`** — capped at 500 rows server-side. For longer history use `?entityType=&entityId=` to scope.

### 22e. Third-party integrations that touch AI-relevant data
- **Email** (nodemailer / SMTP) — invitation, RFQ-to-vendor, PO-to-vendor, password reset. AI agent that triggers `POST /api/purchase/orders/{id}/send` will cause an outbound email. Treat as **HIGH_RISK**.
- **No Slack** integration today (`FEATURE_SLACK_INTEGRATION=false`).
- **No payment gateway** integration. RAB / vendor payments are recorded internally but no actual money movement happens from the app.

### 22f. Gaps and ambiguities in App Contract spec
- The App Contract presumably expects modules + entities + permissions in a specific manifest shape. This app's manifest has `routes`, `featureFlags`, `permissionKeys`, `searchIndexMappings`, and `eventTypes` — same data, different shape. A reshape doc that says "field X in your manifest → field Y in the contract" would help.
- The contract presumably expects every primary entity to have `isSearchable: true | false` and a `summaryEndpoint: "/api/X/{id}/summary"`. This app declares NEITHER. Both need to be added.
- The contract presumably expects field templates with org-customisable enums. This app doesn't have field templates today. Confirmation needed: are field templates a hard requirement, or optional?
- The contract presumably expects `actingAs` propagation through audit. This app's audit story is partial; does the AI team's runtime need a synchronous audit-write contract or can it write its own audit on the AI Runtime side?

### 22g. Known dual-state surface
The dual schema and dual auth-pattern situation means the AI Runtime team will hit edge cases where the same logical entity has two different shapes (e.g. `Project.tenantId` exists in some code paths and not others). The fastest unblock for an AI integration is:
1. Pin to the **canonical shared schema** at `packages/database/prisma/schema.prisma`.
2. Treat **`orgId` as the single tenant scope** and ignore `tenantId` from any local types.
3. For now, route every AI tool call through the newer (Pattern B) endpoints when one exists; the older (Pattern A) routes will eventually be migrated.

---

**End of document.**
