# QuikConstruction → QuikIT Monorepo Migration

**Path chosen:** **B — Full port into the monorepo**
**Target:** `apps/quikconstruction/` alongside `apps/quikscale` and `apps/admin`
**Source:** `QuickConstructionProject-dev-pravin 1.zip` (43,456 LOC)
**Authoring date:** 2026-04-22
**Owner (product):** Ashwin
**Expected duration:** ~6 weeks of focused engineering (revised down from 8 after scope lock)

**Scope lock (confirmed 2026-04-22):**
- Internal-only — no external customers on standalone QuikConstruction
- No mobile app port
- No parallel-maintenance team on standalone — it's frozen from Phase 0
- UX inherits QuikScale theming + `@quikit/ui` (additions only, zero changes to existing exports)
- One-shot cutover at the end (no per-tenant harness)

This doc supersedes any informal "let's just copy it over" instruction. Everything below is the non-negotiable minimum to do this right — any shortcut here ships bugs to customers.

---

## 1. Why we can't do this in one PR

| Dimension | QuikConstruction today | What porting it means |
|---|---|---|
| TypeScript / TSX | 43,456 LOC | Each file reviewed for: tenant isolation, auth replacement, UI swap-out |
| Prisma models | 40 `Cn*` models | Merge into QuikIT schema; decide prefix vs rename; migration plan per tenant |
| Dashboard pages | 75+ | 11 business modules — each needs a port phase |
| API routes | 40+ | Each gets rewrapped in `withTenantAuth` |
| Auth surface | Own `CnDemoUser` + `CnUser` + scrypt passwords + NextAuth config | Replace with `User` + `Membership` from QuikIT |
| Own `src/components` UI kit | Yes | Swap for `@quikit/ui` where possible; keep only domain-specific components |
| Own feature files | `src/domain/**`, `src/lib/**` | Most can move as-is under `apps/quikconstruction/lib/` |
| Own test suite | Playwright + own smoke harness | Wire into QuikIT's vitest + playwright setup |
| Deployment | Separate (port 3010, IIS) | Vercel project `quikconstruction` with turbo-ignore |

**Core reality:** it's architecturally equal to QuikScale. QuikScale itself took months to build. Porting is faster (code exists) but still multi-week.

---

## 2. High-level architecture decision

We will **keep the `Cn*` table prefix** when merging Prisma models. Rationale:

| Option | Pros | Cons |
|---|---|---|
| **Keep `Cn*` prefix** (chosen) | Zero data-migration risk; existing QuikConstruction prod data is portable; visual signal in the schema that these belong to Construction module; avoids collision (e.g. `Project` vs `CnProject`) | Cosmetic inconsistency with QuikScale's non-prefixed models |
| Rename to conventions | Clean schema | Requires per-tenant data migration; merge conflicts on shared concepts like "Project" which QuikIT may grow; painful rollback |

The prefix becomes our *convention* — future construction-only models also use `Cn*`. QuikScale-specific models stay unprefixed. A third app (e.g. QuikHealth) would use its own prefix.

---

## 3. Auth integration strategy

QuikConstruction currently has:
- `CnDemoUser` — 5 hardcoded demo users with scrypt-hashed passwords
- `CnUser` — intended real user table (exists but unused; auth points to CnDemoUser)
- Its own NextAuth config with custom `authorize()` against CnDemoUser
- Role system via `roleKey` string on the user

QuikIT has:
- `User` (id, email, firstName, lastName, password hash, isSuperAdmin)
- `Membership` (tenantId, userId, role, status) — one row per tenant a user belongs to
- `UserAppAccess` (tenantId, userId, appId, role) — app-level permission
- `ROLES` / `ROLE_HIERARCHY` in `@quikit/shared`
- NextAuth config in `@quikit/auth` — reused by every app

**Decision — drop both `CnDemoUser` and `CnUser`. Use QuikIT's `User` + `Membership` + `UserAppAccess`.**

Migration path:
1. During the port, any code that reads `CnDemoUser`/`CnUser` gets rewired to `User`/`Membership`
2. QuikConstruction's `roleKey` column drops — roles come from `Membership.role` (member/admin) + `UserAppAccess.role` (member/admin/viewer)
3. The 5 demo users become real `User` rows via a seed script, owned by a "QuikConstruction Demo" tenant
4. The `CnUser` table is **dropped** at the end of Phase 1 — not kept "just in case"

One intentional gap: QuikConstruction's RBAC is fine-grained (per-resource permissions like "can_approve_po" stored in `CnPermission`). QuikIT's is coarse (role-based). We **keep** `CnPermission` + `CnRole` for domain-specific fine-grained permissions, but `User`/`Membership` stays global. Fine-grained perms become a layer ON TOP of membership, not a replacement.

---

## 4. Schema merge plan

The 40 `Cn*` models merge into `packages/database/prisma/schema.prisma`. Before merge, every model needs these transformations:

| Transformation | What | Why |
|---|---|---|
| 1 | Remove `@@map("cn_*")` if any, or normalize to PascalCase-as-written | Consistency with QuikIT schema |
| 2 | `tenantId` field already exists — good. Remove the `orgId` field (duplicate of tenantId in QuikConstruction's multi-tenant model we don't need) | QuikIT uses one tenant scope, not tenant+org |
| 3 | Add FK to `Tenant` model: `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)` | Referential integrity |
| 4 | Replace `createdBy String` fields with an explicit FK to `User` where practical | Authorship lookup parity with QuikScale |
| 5 | Add `deletedAt DateTime?` + `@@index([deletedAt])` to every mutable business record | Soft-delete parity (QuikScale standard) |
| 6 | Compound unique keys that used `[tenantId, orgId, code]` become `[tenantId, code]` | Drop orgId |
| 7 | Indexes on `[tenantId, orgId]` become `[tenantId]` | Same |

Dry-run via `prisma migrate diff` before every tenant data port.

Risk: **CnDieselLog has 40k rows in prod QuikConstruction**. Any schema change needs an online migration window. Plan:
- Migration scripts execute as `CREATE TABLE new_table + INSERT SELECT + RENAME` to avoid table locks
- Feature-flag the new code path so old writes still work mid-migration

---

## 5. Module port order (6–8 weeks)

Porting module-by-module, each behind a feature flag, ship-testable independently.

### Phase 0 — Scaffold (this session)

- Create `apps/quikconstruction/` with Next.js shell, port 3007
- Wire `@quikit/auth` middleware
- Wire `@quikit/ui` theme
- Register `quikconstruction` in `App` table (migration or seed)
- Add to App Switcher on QuikIT launcher
- Empty sidebar with stubs for 11 modules
- Health check endpoint

**Acceptance:** logging into QuikIT → select tenant → App Switcher shows "QuikConstruction" → click → lands on `localhost:3007/dashboard` with valid QuikIT session.

### Phase 1 — Foundation (Week 1)

- Port `lib/db/*`, `lib/auth/*` (minimal — reuses @quikit/auth), `lib/validation/*`
- Port shared UI scaffolding (layout, sidebar, header — reuse from `@quikit/ui`)
- Port **Masters / Companies** and **Masters / Users** (simplest two; admin-only; teach the pattern)
- Seed demo tenant "QuikConstruction Demo" with 5 users ported from `CnDemoUser`

**Acceptance:** an admin can log into QuikConstruction, view + create a `CnCompany`, view + invite a `User` into the tenant.

### Phase 2 — Masters (Week 2)

- Masters: Vendors, Contractors, Customers, Items, ItemGroups, UOM, GST, TDS, Banks, Departments, WorkCategories, CostCenters, Locations, FinancialYears, Projects, Machinery, Terms, Assets

**Acceptance:** all 18 master modules work. E2E smoke test per module.

### Phase 3 — Procurement (Week 3)

- Purchase: Requisitions, Indents, RFQs, Orders
- Store: GRN, StockRegister, MaterialIssue, GatePass, GoodReturn, Transfer, Reconciliation, DieselLog

**Acceptance:** full PO → GRN → StockLedger flow works end-to-end.

### Phase 4 — Projects (Week 4)

- Projects: BOQ (with Excel import), DPR, Gantt, Estimation, Hindrance, WorkOrders, Documents, RAB

**Acceptance:** project creation → BOQ upload → DPR daily entry works.

### Phase 5 — Finance (Week 5)

- Finance: VendorPayments, PettyCash, Retention, ClientBilling

**Acceptance:** vendor payment workflow complete.

### Phase 6 — HRMS / Safety / Quality (Week 6)

- HRMS: Labour, Attendance
- Safety: Incidents, Toolbox Talks
- Quality: Checklists, Inspections

**Acceptance:** each module smoke-tested.

### Phase 7 — Workflows + Approvals + Reports (Week 7)

- Settings: Workflows, Roles, Permissions
- Approvals page
- Reports page
- Dashboard (construction-specific KPIs)

**Acceptance:** end-to-end PO with approval workflow works.

### Phase 8 — Polish + cutover (Week 8)

- Flip production QuikConstruction from standalone to monorepo-backed
- Data migration scripts for each existing customer tenant
- Delete standalone QuikConstruction codebase + IIS deploy

**Acceptance:** zero downtime cutover per tenant.

---

## 6. What each phase requires

Per phase, these artifacts must exist before merging:

| Artifact | Owner | Blocks merge? |
|---|---|---|
| Prisma schema migration (reversible) | Eng | Yes |
| All API routes have `withTenantAuthForModule()` wrapper | Eng | Yes |
| Tenant-isolation test: cross-tenant request returns 403/404 | Eng | Yes |
| Per-module E2E (Playwright) happy-path | Eng | Yes |
| Unit tests ≥ 60% lines on new service code | Eng | Yes |
| UI uses `@quikit/ui` components (Button, Input, Modal, Table) | Eng | Yes — no custom re-implementations |
| Feature-flag gate so prod can ship with module hidden | Eng | Yes |
| CHANGELOG entry | Eng | Warn-only |
| Docs: one-liner per module in `docs/modules/quikconstruction/` | Eng | Warn-only |

---

## 7. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Standalone QuikConstruction has bugs we inherit | High | Review every ported file as if it were a new PR — catch issues before merging |
| BOQ Excel import logic is gnarly and breaks | Medium | Port with its existing tests; add property tests for column mapping edge cases |
| Tenant isolation holes in ported code (routes missing `tenantId` filter) | High | Mandatory `withTenantAuthForModule()` wrapper; CI lint rule that flags any `findMany`/`findFirst` without `tenantId` in the where clause |
| Data migration at cutover loses records | Medium | Dry-run every tenant migration in a staging DB; compare row counts before/after |
| UI regressions (construction users notice missing buttons) | Medium | UAT window per phase with pilot tenant |
| Deploy complexity (3 Vercel projects + turbo-ignore → 4) | Low | Already handled pattern; one-time config |
| Scope creep: "while you're at it, add X" | High | Strict scope doc per phase; X goes on the backlog for after Phase 8 |

---

## 8. What's NOT in this migration (explicit out-of-scope)

- Mobile app for QuikConstruction (exists today as separate codebase) — not touched in this port
- IIS deployment scripts — discarded; Vercel only
- `CnDemoUser` scrypt password format — discarded; bcrypt via QuikIT convention
- QuikConstruction's separate SSO config — discarded; uses QuikIT's unified auth (which will include Google + Microsoft per `SSO_REQUIREMENTS.md` once DevOps completes that work)
- Any "let's improve X while porting" — if it's not behavior-preserving, it's out of scope for port, file a ticket for after

---

## 9. Definition of done for the overall migration

- [ ] All 40 `Cn*` Prisma models live in `packages/database/prisma/schema.prisma`
- [ ] Standalone QuikConstruction codebase repository archived (not deleted) and read-only
- [ ] `apps/quikconstruction/` at feature parity with standalone version
- [ ] Vercel project `quikconstruction` deployed to prod with turbo-ignore working
- [ ] App Switcher shows QuikConstruction for tenants with access
- [ ] `UserAppAccess` per-user access-control works (admin can grant/revoke)
- [ ] All existing customer tenants migrated with zero data loss
- [ ] Mobile app (if kept) points at new backend (same schema, auth token changed)
- [ ] Internal docs + runbooks updated

---

## 10. Who needs to review/approve

| Area | Reviewer |
|---|---|
| Schema merge strategy | Principal engineer / you |
| Auth replacement plan | Security / you |
| Phase sequencing | Product (Ashwin) |
| Per-phase code review | 1 senior engineer per merge |
| Data migration scripts | DBA / DevOps |
| Production cutover | Full team (you, Eng lead, DevOps) |

---

## 11. Out-of-session work: what happens next

### This session (today):
- ✅ This document
- ✅ Phase 0 scaffold: empty `apps/quikconstruction/` that boots, uses QuikIT auth, appears in App Switcher

### Next session(s):
- Phase 1 — Foundation (requires scheduled time, ~1 week)
- Continue through Phases 2–8 per the sequence above

---

## 12. Open questions for Ashwin

1. **Existing customers?** Is QuikConstruction already in production with real customer data? If yes, cutover plan changes significantly (per-tenant migration windows).
2. **Mobile app?** Does it exist, and does it share the Prisma schema, or have its own?
3. **Who owns the code?** Is there an existing team maintaining QuickConstruction, or is this a full hand-off to the QuikIT team?
4. **Brand/UX consistency?** Do we bring QuikScale's accent-color theming, sidebar patterns, and table style to QuikConstruction, or preserve its own look?
5. **Target launch date?** Is there a customer deadline, or is this internal-only urgency?

Answers to these shape Phase 0 scaffolding — e.g. if there are live customers, we build the staging-cutover harness earlier.
