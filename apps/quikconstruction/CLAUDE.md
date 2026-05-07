# CLAUDE.md

Auto-loaded by Claude Code on every session. Keep concise. For full architecture see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Project at a glance

**QuikConstruction** — Next.js 14 App Router construction ERP. Multi-tenant (PostgreSQL via Prisma), NextAuth for sessions, role-based permissions, approval workflow engine. Excel BOQ import → project execution (DPR/RAB) → stock + procurement.

```
Stack:    Next.js 14 · TypeScript · Prisma 5.22 · PostgreSQL · NextAuth · React Query · Tailwind · Playwright · SheetJS · nodemailer · pdf-lib
Dev port: 3010 (pnpm dev)
Tests:    pnpm test:api  |  pnpm test:e2e  |  pnpm test:smoke
```

Directory shape:

```
app/(dashboard)/  → authenticated pages (route group, no /dashboard prefix)
app/api/          → route handlers
src/lib/          → server libs (auth, rbac, boq, purchase, store, projects, http, ...)
src/components/   → client UI (FormDrawer, QuickCreateDrawer, ImportDataDrawer, ...)
src/hooks/        → React Query wrappers (use-masters, use-projects, ...)
prisma/           → schema (74 models, all `Cn` prefixed) + seed
tests/            → api + e2e (Playwright)
```

---

## Working rules (read every session)

### Routes
- Every API route: `await requirePermission("construction.<domain>.<action>")` first. Returns `TenantContext` or a NextResponse — handle both.
- Wrap mutations in `withMutationRoute` ([src/lib/http/route-wrappers.ts](src/lib/http/route-wrappers.ts)) — gives auto envelope, body parsing, Prisma error mapping.
- Response envelope: `{ ok, data | error: { code, message }, requestId }` via `ok()` / `err()` ([src/lib/http/envelope.ts](src/lib/http/envelope.ts)).
- Logging: `logger.info({ msg: "snake_case_event", ...structuredFields })`. Never interpolate values into the `msg` key.
- For retry-able mutations (approvals, financial txns) wrap in `idempotencyGuard` ([src/lib/workflow/idempotency.ts](src/lib/workflow/idempotency.ts)).

### Database
- Models prefixed `Cn` (historical — "construction"). Don't rename.
- **Always include `tenantId` in `where` clauses.** A `findUnique({ where: { id } })` from a route is a tenant leak.
- Money: `Decimal(18, 2)`. Quantity: `Decimal(18, 4)`. **Never `Float`.**
- Masters use soft delete (`status = 'inactive'`). Hard-delete only transient join rows.
- Side effects go through append-only ledgers — `CnStockLedger`, `CnBOQProgressLedger`, `CnBOQBillingLedger`, `CnApprovalHistory`, `CnAuditLog`. Reversals = compensating row, never UPDATE.

### Code style
- Domain logic in repositories / services, not in `route.ts`. Routes only gate, parse, dispatch, envelope.
- Prefer editing existing files. Don't create new ones unless necessary.
- No comments unless the WHY is non-obvious. Don't reference current task / PR / issue numbers in comments.
- Don't add `// removed X` markers, `_unused` rename hacks, or backwards-compat shims for unreleased code.
- Don't write planning / decision / summary `.md` files unless the user explicitly asks.

### Auth in tests / dev
- `AUTH_DEMO_MODE=true` (default in dev) bypasses NextAuth.
- Switch persona via `x-test-role: <role_key>` header — gated on `NODE_ENV !== production`.
- Roles: `platform_super_admin`, `tenant_admin`, `project_manager`, `site_admin`, `accountant`, `user`. Permission keys: `construction.<domain>.<action>`.

---

## BOQ Import (where the most recent work was)

Pipeline: `RawSheet[] → detect → adapter → normalize → resolveHierarchy → validate → PipelineResult`

Three adapters in [src/lib/boq/import/](src/lib/boq/import/):

| Adapter | When |
|---------|------|
| **STRICT_TEMPLATE** ([strict-adapter.ts](src/lib/boq/import/strict-adapter.ts)) | 6 fixed columns: BOQ No / SOR No / Description / Unit / Rate / Op. Undone Qty |
| **GENERIC_SOR** ([generic-adapter.ts](src/lib/boq/import/generic-adapter.ts)) | Aakar / govt SOR — header roles detected by alias matching. **Most real imports go through here.** |
| **UNIVERSAL** ([universal-adapter.ts](src/lib/boq/import/universal-adapter.ts)) | Manual user mapping (via `/detect-columns` → form → resubmit). Vendor quotes / arbitrary layouts. |

Hierarchy resolution ([hierarchy.ts](src/lib/boq/import/hierarchy.ts)) is **prefix-first, stack-fallback**: try `prefixParent(ref)` against the same-category ref index; if absent, walk the parent stack and pick the first ancestor whose code is a true prefix of the current ref.

Dedup ([validator.ts](src/lib/boq/import/validator.ts)): duplicate `(category, boqNo)` is auto-suffixed `_2`, `_3`, … with a non-blocking warning. Real BOQs reuse short refs across sections.

Entry points:
- `POST /api/projects/[projectId]/boq/preview-upload` — dry-run pipeline, returns sample + full normalized rows.
- `POST /api/projects/[projectId]/boq/import` — caller posts back the rows from preview; server re-validates and persists.
- `POST /api/projects/[projectId]/boq/detect-columns` — Universal mode column suggestions.
- `POST /api/projects/[projectId]/boq/lock` / `unlock` — once locked, `tenderQty` and `rate` become read-only.

---

## Recent session changes (BOQ import format fix)

### Problem solved
User's BOQ Excel had:
1. Plain `SOR` as the column header (not `S.No.` / `SOR No` / `BOQ No`).
2. Mixed format — some rows used full dotted codes (`A.2.1`, `A.2.1.1`), others used letter-only sub-codes (`a`, `b`, `c`, `d`) under a dotted parent.

After import, items lost their hierarchy: letter-only rows ended up flat under the top-level group instead of nesting under `A.2.1`, and the dedup auto-suffixed siblings into `a`, `a_2`, `a_3`, ….

### Files changed

**[src/lib/boq/import/generic-adapter.ts](src/lib/boq/import/generic-adapter.ts)**
- Line 64 — added `"SOR"`, `"SOR Code"`, `"SOR Ref"` to `ROLE_ALIASES.sorItem` so the bare `SOR` header resolves.
- Lines 213–220 — new `lastDottedParent` carry-forward state.
- Lines 280–290 — when current ref matches `/^[a-zA-Z]{1,3}$/` and `lastDottedParent` is set, synthesize `boqNo = lastDottedParent + "." + ref`. Track the synthesis with `wasSynthesized`.
- Line 379 — `rawBoqNo: rawRef` preserves the original cell value as audit trail.
- Lines 412–419 — after classification, update `lastDottedParent` only when row is a group with a dotted ref AND wasn't itself synthesized. (Prevents leaf `A.2.1.1` from shadowing the real parent `A.2.1`.)

**[src/lib/boq/import/universal-adapter.ts](src/lib/boq/import/universal-adapter.ts)**
- Line 150 — added `/^sor$/i`, `/sorcode/i`, `/sorref/i` to the `boq_number` auto-suggest patterns.
- Line 343 — new `lastDottedParent` state.
- Lines 398–417 — same carry-forward logic, gated on `type === "SECTION_HEADER"`.

### Verified output (user's exact Excel structure)

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
        [L] A.3.1.b   parent=A.3.1    raw=b
        ...
    [L] A.4.1     parent=A            raw=A.4.1
```

`rawBoqNo` preserves the literal cell value (`a`, `b`, ...); `boqNo` is the synthesized full path. Hierarchy renders correctly. No `_2` / `_3` mangling because synthesized refs are unique within their parent.

### What user should do
Re-upload the same Excel after these changes. Pick **AUTO** mode (or **GENERIC_SOR**). Hierarchy will be correct.

---

## Pre-existing test failures (don't chase)

`tests/api/boq-import-pipeline.spec.ts` has **8 failures unrelated to the BOQ format fix**. They were failing before this session and stay failing after. Confirmed via `git stash` round-trip.

Most are strict-template adapter assertions and a depth-cap test that expects `depth: 5` while the generic adapter caps at 3. Either the test expectations or the adapter cap need updating — out of scope for the BOQ format work but worth flagging if the user asks about test pass rates.

```
strict template adapter › parses a minimal valid strict sheet
strict template adapter › classifies leaves: unit + rate required, qty=0 still leaf
strict template adapter › rejects rows missing BOQ No
strict template adapter › preserves source row numbers for error reporting
detection + mode dispatch › detects strict template by header signature
cross-row validation › DUPLICATE_BOQ_NO_IN_CATEGORY rejected
category mapping › unknown category passes through with warning
depth handling › deep refs cap at depth 5 with warning
```

---

## Likely follow-ups for future sessions

- Fix the 8 pre-existing test failures (decide: cap depth at 5 or update test to expect 3).
- Wire reject / return flows into DPR + RAB approval routes.
- Add `/api/audit` endpoint (referenced in tests but not yet implemented).
- Migrate any remaining purchase routes from in-memory `globalThis` to DB + approval-service (Phase-2b).
- Consider Zod schemas for request validation in critical routes (currently hand-rolled in `src/lib/validators.ts`).

---

## Quick reference

```
ENVELOPE          { ok, data | error: { code, message }, requestId }
AUTH GATE         await requirePermission("construction.<domain>.<action>")
TENANT SCOPE      Always include tenantId in every Prisma where clause
LEDGER PATTERN    Append-only — reversal = compensating row, never UPDATE
DOC NUMBER        nextDocNumber(ctx, projectId, "PO") → "PO-PROJ-FY-####"
IDEMPOTENCY       idempotencyGuard(req, ctx, "approve-po") for replays
DEMO MODE         AUTH_DEMO_MODE=true + x-test-role header (NEVER prod)
LOG               logger.info({ msg: "snake_case_event", ...fields })
DECIMAL           Money 18,2 — Quantity 18,4 — Never Float
SOFT DELETE       status = 'inactive' on masters
BOQ ENTRY POINTS  /preview-upload (dry-run) → /import (persist)
```

For deeper architecture, module → API → service mapping, full DB conventions, and BOQ pipeline internals, see [ARCHITECTURE.md](ARCHITECTURE.md).
