# QuikScale — Code Analysis & Action Plan

**Generated**: 2026-04-11
**Scope**: `apps/quikscale` + `packages/*`
**Analyst**: Claude (3 parallel Explore agents)

This is a read-only audit. No code changes here — only findings and a prioritized plan.

---

## 1. Executive Summary

| Dimension | Status | Notes |
|---|---|---|
| **Backend auth + tenant isolation** | 🟢 Excellent | All 42 routes properly gated |
| **Team KPI logic** | 🟢 Well-built | Edge cases handled, permission model clean |
| **Data model consistency** | 🟢 Good | All `Json?` columns have TS types in `page.tsx` |
| **Frontend component library** | 🟡 Partial | 5 tooltip copies, 3 picker components, duplicate Button |
| **Large files needing split** | 🔴 Critical | OPSP page: 2225 lines; KPIModal: 1090; LogModal: 1017 |
| **Design tokens / consistency** | 🟡 Partial | 298 hardcoded `blue-*` vs 6 `accent-*` classes |
| **Test coverage** | 🔴 Zero | No tests, no runner, no CI hook |
| **Audit logging** | 🟡 Partial | `AuditLog` table unused; only KPILog writes exist |
| **Soft delete** | 🟡 Partial | Only KPI has `deletedAt`; others hard-delete |
| **Pagination** | 🔴 Missing | 40 of 42 list endpoints have no pagination |
| **API boilerplate duplication** | 🟡 Medium | ~35 routes repeat the auth + tenantId check |

---

## 2. File Size Inventory (Top 10 Largest)

| # | File | Lines | Status |
|---|---|---|---|
| 1 | `app/(dashboard)/opsp/page.tsx` | 2225 | 🔴 Critical split |
| 2 | `app/(dashboard)/kpi/components/KPIModal.tsx` | 1090 | 🔴 Critical split |
| 3 | `app/(dashboard)/kpi/components/LogModal.tsx` | 1017 | 🔴 Critical split |
| 4 | `app/(dashboard)/priority/components/PriorityTable.tsx` | 734 | 🟡 Should split |
| 5 | `app/(dashboard)/www/components/WWWTable.tsx` | 641 | 🟡 Should split |
| 6 | `components/ui/sign-in.tsx` | 573 | 🟡 Large |
| 7 | `app/(dashboard)/kpi/components/KPITable.tsx` | 439 | 🟡 Large |
| 8 | `app/(dashboard)/priority/components/PriorityModal.tsx` | 332 | OK |
| 9 | `app/(dashboard)/priority/components/PriorityLogModal.tsx` | 332 | OK |
| 10 | `components/dashboard/Sidebar.tsx` | 268 | OK |

**OPSP `page.tsx` has 36 inline functions/sub-components** — including `TargetsModal`, `GoalsModal`, `RocksModal`, `OPSPPreview`, `RichEditor`, `CategorySelect`, `OwnerSelect`, `ProjectedInput`, `WithTooltip`, `CritBlock`. This file alone could become ~12 focused files at 150-300 lines each.

---

## 3. Duplication Hotspots

| Hotspot | Files Involved | Estimated Dup Lines | Recommended Canonical |
|---|---|---|---|
| **Picker components** | `UserPicker.tsx` (128) + `UserMultiPicker.tsx` (161) + `FilterPicker.tsx` (194) + inline `OwnerSelect` in opsp (~70) + inline `CategorySelect` in opsp (~110) | ~300 | New `UserSelect` in `@quikit/ui` with `mode: "single" \| "multi"` prop |
| **Tooltip components** | `WithTooltip` (opsp inline), `NameTooltip.tsx`, `DescTooltip.tsx`, `WeekTooltip.tsx`, 2 inline tooltips inside `PriorityTable.tsx` | ~240 | New `@quikit/ui/tooltip` base + thin domain wrappers |
| **Button components** | `apps/quikscale/components/Button.tsx` (101) duplicates `packages/ui/components/button.tsx` (60) | 101 | Delete QuikScale local, use `@quikit/ui` |
| **API auth+tenant boilerplate** | Repeated in ~35 route files (8 lines each) | ~280 | New `withTenantAuth()` wrapper in `lib/api` |
| **Permission check** (membership lookup + role-hierarchy) | `teamKPIPermissions.ts`, `kpiWeeklyPermissions.ts`, inline in several routes | ~60 | New `hasMinRole(userId, tenantId, minLevel)` helper |
| **CRUD hooks** (useKPI + usePriority + useWWW) | 3 files, ~356 lines | ~200 | Generic `createCRUDHook(endpoint)` factory |
| **Avatar helpers** (`avatarBg`, `initials`) | Inside each picker file (3 copies) | ~45 | New `lib/utils/avatar.ts` |

---

## 4. Backend — API + Schema Findings

### 4.1 Standard response shape violations

| Route | Current shape | Expected | Severity |
|---|---|---|---|
| `GET /api/opsp` | `{ data, fiscalYearStart }` | `{ success, data }` | 🟡 Medium |
| `PUT /api/opsp` | `{ data, savedAt }` | `{ success, data }` | 🟡 Medium |
| `POST /api/opsp` | same | `{ success, data }` | 🟡 Medium |
| `GET /api/session/validate` | `{ valid, hasTenant }` | `{ success, data }` | 🟡 Medium |

### 4.2 Prisma model/relation issues

| Issue | Affected Models | Severity | Fix |
|---|---|---|---|
| Model naming inconsistency (`KPI`, `WWWItem`, `OPSPData` vs others) | Schema-wide | 🟢 Low | Rename to `Kpi`, `WwwItem`, `OpspData` — big migration though |
| `KPI.owner` → `User` relation has no cascade rule (defaults to Restrict) | `KPI`, `Priority` | 🟡 Medium | Add `onDelete: SetNull` since KPI rows have no owner already |
| `PerformanceReview.reviewee` → `User` no cascade | `PerformanceReview` | 🟡 Medium | Same fix |
| `status` field is free-form string across 8+ models | `Tenant`, `User`, `Membership`, `KPI`, `Priority`, `WWWItem`, etc. | 🟡 Medium | Create Prisma enums: `KpiStatus`, `MembershipStatus`, etc. |
| `Json?` columns without TS interfaces in `lib/types` | `OPSPData.employees`, `customers`, `shareholders`, `actions`, `targetRows`, `keyThrusts`, `keyInitiatives`, `rocks`, `criticalNum*`, etc. | 🟢 OK in practice | FormData interface in `page.tsx` covers these, but types not exported for reuse |

### 4.3 Missing indexes

| Model.Fields | Query Pattern | Impact |
|---|---|---|
| `[tenantId, createdAt]` on `AuditLog` | "Last N audit entries" queries | 🟡 Medium |
| `[tenantId, who]` on `WWWItem` | Dashboard "my WWW items" filter | 🟡 Medium |
| `[tenantId, owner]` on `Priority` | Owner-specific dashboards | 🟡 Medium |
| `[tenantId, role]` on `Membership` | "Find all admins" bulk queries | 🟢 Low |
| `[tenantId, scheduledAt]` on `Meeting` | Calendar views | 🟡 Medium |
| `[kpiId, createdAt]` on `KPILog` | Audit trail date ranges | 🟢 Low |

### 4.4 Error handling violations (CLAUDE.md says `catch (error: unknown)`)

Routes still using `catch (error: any)`:
- `app/api/kpi/route.ts`
- `app/api/kpi/[id]/route.ts`
- `app/api/kpi/[id]/weekly/route.ts`
- `app/api/kpi/[id]/logs/route.ts`
- `app/api/kpi/[id]/notes/route.ts`
- `app/api/kpi/years/route.ts`
- `app/api/users/route.ts`
- `app/api/performance/trends/route.ts` (uses `catch (e: any)`)

### 4.5 Pagination coverage

| Route | Has pagination? | Has filters? |
|---|---|---|
| `GET /api/kpi` | ✅ | ✅ |
| `GET /api/priority` | ❌ | Partial |
| `GET /api/www` | ❌ | ❌ |
| `GET /api/org/users` | ❌ | ❌ |
| `GET /api/org/teams` | ❌ | ❌ |
| `GET /api/org/quarters` | ❌ | ❌ |
| `GET /api/daily-huddle` | ❌ | ❌ |
| `GET /api/performance/reviews` | ❌ | ❌ |

---

## 5. Frontend — UI/UX Findings

### 5.1 Design token gaps

| Token category | Current state | Hardcoded count |
|---|---|---|
| Text sizes | Uses `text-[9px]`, `text-[10px]`, `text-[11px]` outside Tailwind scale | 253 instances |
| Blue → Accent | `blue-*` used directly instead of `accent-*` | 298 instances |
| Gray shades | 10 different gray-* shades used (50, 100, 200, 300, 400, 500, 600, 700, 800, 900) | 2019 instances |
| Spacing | No standard: `px-2 py-1`, `px-3 py-1.5`, `px-3 py-2`, `px-4 py-2` all coexist | Mixed |

### 5.2 `dangerouslySetInnerHTML` usage (XSS surface)

14 instances in `apps/quikscale/app/(dashboard)/opsp/page.tsx` (all inside `OPSPPreview`), used to render rich-editor HTML in the print view. All render user-owned content (their own saved OPSP data), so the attack surface is self-XSS. Still worth reviewing the `html()` helper for sanitization.

### 5.3 Hook duplication

| Feature | Hook File | Pattern |
|---|---|---|
| KPI CRUD | `lib/hooks/useKPI.ts` (156) | Create/update/delete with React Query |
| Priority CRUD | `lib/hooks/usePriority.ts` (123) | Same pattern |
| WWW CRUD | `lib/hooks/useWWW.ts` (97) | Same pattern |

~60% of these 356 lines is identical CRUD boilerplate. A `createCRUDHook<T>(endpoint)` factory could reduce to ~100 lines total.

### 5.4 Components ready to promote to `@quikit/ui`

| Component | Current Location | Rationale |
|---|---|---|
| `UserPicker` | `apps/quikscale/components/UserPicker.tsx` | Generic, reusable across apps |
| `UserMultiPicker` | `apps/quikscale/components/UserMultiPicker.tsx` | Generic |
| `FilterPicker` | `apps/quikscale/components/FilterPicker.tsx` | Generic |
| `Tooltip` (base) | Would be extracted from existing 5 variants | Primitive |
| `ColMenu` | `apps/quikscale/components/table/ColMenu.tsx` | Table primitive |
| `HiddenColsPill` | `apps/quikscale/components/table/HiddenColsPill.tsx` | Table primitive |

### 5.5 Components to move from local to shared

| Local utility | Recommended `@quikit/shared` home |
|---|---|
| `formatDate`, `formatDateTime`, `formatRelativeDate` (lib/utils.ts) | `@quikit/shared/format` |
| `slugify`, `isValidEmail`, `truncateText` | `@quikit/shared/strings` |
| `getQuarterFromMonth`, `getCurrentQuarter`, `getCurrentYear` | `@quikit/shared/time` |
| `deepClone`, `retry` | `@quikit/shared/objects` |
| `avatarBg`, `initials` (currently duplicated 3x) | `@quikit/ui/avatar-helpers` |

---

## 6. Missing / Broken — Prioritized

### 🔴 Critical (fix first)

1. **Zero test coverage.** No runner, no unit tests, no integration tests, no E2E. For a production SaaS this is a showstopper.

   **Step-by-step solution — how to move ahead:**

   **Phase A — Foundation (Week 1, ~8h)**
   | # | Step | What to do | Output |
   |---|---|---|---|
   | A1 | Pick the stack | **Vitest** (unit + integration, fast, ESM-native, Turborepo-friendly) + **@testing-library/react** (components) + **Playwright** (E2E). Skip Jest — it's heavier and Vitest speaks the same API. | Decision recorded |
   | A2 | Install at repo root | `pnpm add -D -w vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom` | `package.json` updated |
   | A3 | Add `vitest.config.ts` per app | Each of `apps/quikscale`, `apps/admin`, `apps/super-admin` gets its own config pointing at `./tests` with `environment: "jsdom"`, path alias `@/` → `./`. | 3 config files |
   | A4 | Wire Turborepo | Add `test` task to `turbo.json` with `dependsOn: ["^build"]` and cache outputs. Add root script `"test": "turbo run test"`. | `turbo.json` + root `package.json` |
   | A5 | Create test DB setup | New `packages/database/test-utils/` with `setupTestDb()` (spins up SQLite in-memory or a Postgres schema per worker), `seedTenant()`, `truncateAll()`. Export a shared `testDb` Prisma client. | 1 utility package |
   | A6 | Add `tests/setup.ts` per app | Imports `@testing-library/jest-dom`, mocks `next/navigation`, stubs `next-auth/react` session provider. | 3 setup files |
   | A7 | Add CI hook | GitHub Actions workflow `.github/workflows/test.yml` runs `pnpm test` on every PR to `dev`, `uat`, `main`. **Red build blocks merge.** | 1 workflow file |

   **Phase B — Smoke tests for critical paths (Week 1-2, ~12h)**

   Write the minimum tests that catch the scariest regressions **first**. Don't chase coverage — chase blast radius.

   | Priority | Test target | Type | Why |
   |---|---|---|---|
   | P0 | `getTenantId()` — unauthenticated → throws; authed → returns id | Unit | Every route depends on this. A broken helper = tenant leak. |
   | P0 | `requireAdmin()` + `requireSuperAdmin()` — role hierarchy enforced | Unit | Privilege escalation surface. |
   | P0 | `canEditKPIOwnerWeekly()` — admin/team-head/self/past-week-lock matrix | Unit | Team KPI permission model — most complex logic in the repo. |
   | P0 | `POST /api/kpi` (individual + team) — Zod invariants reject bad input | Integration | Prevents shape corruption in `Json?` columns. |
   | P0 | `POST /api/kpi` — cross-tenant write blocked | Integration | Tenant isolation is the core safety property. |
   | P0 | `GET /api/kpi` — returns only same-tenant rows | Integration | Tenant isolation on read. |
   | P1 | `normalizeLoadedOPSP()` — handles legacy shapes without throwing | Unit | OPSP is 2225 lines with 36 inline subs — impossible to refactor without this safety net. |
   | P1 | `kpiSchema.refine()` — team KPI requires `ownerIds.length > 0` + contributions sum to 100 | Unit | Core invariant. |
   | P1 | `progressColor()` + `weekCellColors()` in `kpiHelpers.ts` | Unit | Pure functions, cheap to test, used in 4+ tables. |
   | P1 | `fiscal.ts` — `getCurrentWeekNumber`, quarter boundaries, fiscal year start | Unit | All dashboards depend on this; leap-year edge cases. |
   | P2 | `KPITable` renders + filters + sorts (RTL) | Component | Biggest shared component. |
   | P2 | `KPIModal` opens in individual vs team scope, validates, saves | Component | Biggest single component. |

   **Exit criteria for Phase B**: ~25-30 tests, all green, runtime < 30s. This gives you a safety net to start refactoring OPSP and KPIModal without fear.

   **Phase C — E2E happy paths (Week 2-3, ~8h)**

   Playwright against a dev server seeded with a known tenant. Not many tests — just the ones that prove the app is alive end-to-end:

   | Flow | Steps | Why |
   |---|---|---|
   | Login → Dashboard | `/login` → enter creds → lands on `/dashboard` with KPI/Priority/WWW cards visible | Auth + session provider stack |
   | Create individual KPI | `/kpi` → "+ Add" → fill form → save → row appears in table | Happy path through form → API → DB → UI |
   | Log weekly value | Click week cell → modal → enter value → save → cell updates color | The most common user action in the app |
   | Open OPSP → edit Rocks → save → reload → data persists | Full JSON-column round trip | Proves OPSP form ↔ schema ↔ reload works |
   | Non-admin cannot see team KPI edit button | Sign in as member → `/kpi/teams` → Edit button hidden | Permission UI check |

   **Phase D — Coverage over time (ongoing)**

   | Rule | Target |
   |---|---|
   | **Every bug fix** must ship with a regression test | Prevents the same bug twice |
   | **Every new API route** must have tenant-isolation + happy-path test | Non-negotiable |
   | **Every new shared util** must be ≥90% covered | Utils are cheap to test and high-leverage |
   | **Coverage ratchet**: CI fails if overall coverage drops | Use `vitest --coverage` + a threshold file |
   | **Refactor target**: reach 50% line coverage before starting OPSP decomposition | Safety net |

   **Order of operations (2-3 weeks total)**:
   1. **Day 1-2**: Phase A (foundation) — don't write tests yet, just make `pnpm test` run and pass with zero tests
   2. **Day 3-5**: Phase B P0 tests (8 tests, all security/tenant-isolation)
   3. **Week 2**: Phase B P1 + P2 tests + CI enforcement
   4. **Week 3**: Phase C Playwright E2E
   5. **From then on**: Phase D discipline — no merge without a test for the change

   **First commit should be**: `test: scaffold Vitest + Playwright harnesses with 0 tests` — green on CI, nothing tested yet. That baseline alone is progress.

2. **OPSP page is 2225 lines in one file.** Unmaintainable. Must split into 10-12 focused files.
3. **Pagination missing on 40 of 42 list endpoints.** Will break at scale.
4. **`AuditLog` table is defined but never written to.** Only KPILog has custom audit. No audit trail for Priority, OPSPData, Team, User, Meeting changes.

### 🟡 High priority

5. **Soft delete only on KPI.** Team, User, Priority, OPSPData, Meeting all hard-delete — data loss risk.
6. **No rate limiting.** Any authenticated user can spam any endpoint.
7. **No component-level error boundaries.** One global boundary in `(dashboard)/error.tsx`; errors in feature modules cascade.
8. **No validation schemas for OPSPData, Team CRUD, User updates.** Routes accept raw bodies.
9. **35+ routes repeat auth + tenantId boilerplate.** ~280 lines of duplication.
10. **3 picker components with 70% overlapping code.** `UserPicker`, `UserMultiPicker`, `FilterPicker`.
11. **5 tooltip variants with ~240 lines of duplication.**
12. **Duplicate Button component** (`apps/quikscale/components/Button.tsx` shadows `packages/ui/components/button.tsx`).

### 🟢 Medium/Low

13. Naming inconsistency (`KPI`, `WWWItem`, `OPSPData` → `Kpi`, `WwwItem`, `OpspData`). Big migration for cosmetic win.
14. `catch (error: any)` → `catch (error: unknown)` in 8 routes.
15. Missing composite indexes on AuditLog, WWWItem, Meeting, Priority.
16. 298 hardcoded `blue-*` should be `accent-*`.
17. 253 hardcoded `text-[Npx]` should become Tailwind tokens.
18. Non-standard response shapes on `/api/opsp` (missing `success` field).
19. `Prisma enum` missing for status fields across 8+ models.

---

## 7. Prioritized Action Plan

| # | Action | Est. effort | Files affected | Impact |
|---|---|---|---|---|
| 1 | **Add test runner (Vitest) + smoke tests for critical API routes** | 8h | New `vitest.config.ts`, `tests/` | Critical |
| 2 | **Decompose OPSP page.tsx** into `app/(dashboard)/opsp/components/*` + `lib/types/opsp.ts` + `lib/utils/opsp-form.ts` | 20h | 1 file → ~12 files | Critical |
| 3 | **Extract `withTenantAuth()` helper** to `lib/api/middleware.ts`, refactor all 35 routes | 6h | 35 route files | High |
| 4 | **Consolidate pickers**: new `UserSelect` + `components/ui/Tooltip` + delete duplicate `Button` | 12h | ~8 files | High |
| 5 | **Add pagination to Priority, WWW, Users, Teams, DailyHuddle list endpoints** | 6h | 5 route files + 5 hooks | High |
| 6 | **Decompose KPIModal + LogModal** into hooks + form sections | 24h | 2 files → ~10 files | High |
| 7 | **Add `AuditLog` writes** to Priority/OPSPData/Team/User CRUD | 8h | ~8 route files | High |
| 8 | **Add soft-delete (`deletedAt`)** to Team, Priority, OPSPData, User models + update all queries | 12h | Schema + ~10 routes | Medium |
| 9 | **Design tokens**: add Tailwind font sizes (`caption`, `tiny`, `micro`), replace hardcoded `text-[Npx]`, migrate `blue-*` → `accent-*` | 8h | tailwind.config + ~30 files | Medium |
| 10 | **Extract CRUD factory** (`createCRUDHook`), refactor `useKPI`/`usePriority`/`useWWW` | 6h | 3 hook files + ~30 component imports | Medium |
| 11 | **Move shared utils** (`formatDate`, `slugify`, `avatarBg`, etc.) to `@quikit/shared` / `@quikit/ui` | 4h | ~5 files | Medium |
| 12 | **Add missing composite indexes** to schema | 1h | schema.prisma | Low |
| 13 | **Standardize error handling**: `catch (error: any)` → `catch (error: unknown)` | 2h | 8 files | Low |
| 14 | **Standardize response shapes** on `/api/opsp` and `/api/session/validate` | 2h | 2 route files | Low |
| 15 | **Add Zod schemas** for OPSPData PUT, Team CRUD, User update | 4h | 3 files | Low |

**Total estimated effort (Phase 1 items 1-7)**: ~84 hours.
**Total estimated effort (Phase 2 items 8-15)**: ~39 hours.

---

## 8. Test Cases & QA Results (Manual, This Session)

These are the manual QA checks I ran or the user ran during the session. They're the "use cases" the build was validated against.

| # | Use case | Expected | Result |
|---|---|---|---|
| 1 | Open `/kpi` — Individual KPIs load | List of 26 individual KPIs, filterable by year/quarter/owner/team | ✅ Pass |
| 2 | Open `/kpi/teams` — Team sections render | All 10 teams render, sorted KPIs-first then alphabetical | ✅ Pass |
| 3 | Add a team KPI as admin | Modal opens in team scope, contribution inputs sum to 100, saves | ✅ Pass |
| 4 | Edit a team KPI weekly value as admin | Per-owner breakdown appears in LogModal, save succeeds | ✅ Pass (Phase 2) |
| 5 | Edit a weekly value as non-admin, non-team-head, non-owner | API returns 403 | ✅ Pass |
| 6 | Week tooltip on team KPI shows per-owner targets | Tooltip renders below cell with each owner + `actual/target` | ✅ Pass |
| 7 | Team filter on `/kpi/teams` (multi-select) | Only selected teams render, Select All toggle works | ✅ Pass |
| 8 | OPSP Key Initiatives saves 5 `{desc, owner}` rows | Persists across refresh via `Json` column | ✅ Pass |
| 9 | OPSP Rocks expand modal | Opens with 5 rows + larger OwnerSelect | ✅ Pass |
| 10 | OPSP TARGETS modal year headers reflect `fiscalYearStart` | "2026 - 27" for April start, "2026" for Jan start | ✅ Pass |
| 11 | ProjectedInput split for Currency | Symbol + number + scale dropdown (K/M/B for USD, K/L/Cr for INR) | ✅ Pass |
| 12 | OwnerSelect shows initials with hover tooltip | "DS" with "Dhwani Sharma" tooltip on hover | ✅ Pass |
| 13 | `/priority`, `/www`, `/dashboard` still compile | All routes 307 on unauthenticated curl | ✅ Pass |
| 14 | Dashboard pagination — KPI/Priority/WWW tables | Next/Previous work | ✅ Pass |
| 15 | Category truncate + hover tooltip | Long category names truncate, tooltip on hover | ✅ Pass |
| 16 | Backup branches exist | `backup/pre-teams-kpi-*` and `backup/pre-analysis-*` | ✅ Pass |

**Gap**: There are **no automated tests**. All of the above are manual spot-checks the user or I performed. A test harness must be added.

---

## 9. What's Well-Built (Don't Break)

Per the agent analysis, the following are in good shape:

- **Auth + tenant isolation**: Consistent across all routes. Every query filters by `tenantId`; every route validates session.
- **Team KPI weekly permission model**: `canEditKPIOwnerWeekly` handles admin/team-head/self-edit cleanly with past-week lock.
- **KPI Modal's create validation**: Zod `.refine()` invariants for individual vs team KPIs.
- **OPSP form ↔ Prisma schema mapping**: `FormData` interface matches `OPSPData` model 1:1; `normalizeLoadedOPSP` handles legacy shapes defensively.
- **Current week fiscal calc**: Uses DB-backed `quarterSettings` rather than hardcoded dates; properly handles leap years (91/91/91/93 day distribution).
- **Password handling**: bcrypt cost 12, no hardcoded secrets, environment variables used correctly.
- **Backup branch pattern**: `git commit-tree` without touching working tree — safe and repeatable.

---

## 10. Recommendations — Order of Operations

**If you want to improve the codebase in one focused sprint**, do these in order:

1. **Week 1**: Item 1 (testing harness) + Item 2 (OPSP decomposition) — sets foundation
2. **Week 2**: Item 3 (auth middleware) + Item 5 (pagination) + Item 6 (KPIModal/LogModal decomp)
3. **Week 3**: Item 4 (picker/tooltip consolidation) + Item 9 (design tokens)
4. **Week 4**: Items 7, 8, 10 (audit log + soft delete + CRUD factory)
5. **Backlog**: Items 11-15 (low-priority cleanups)

After completing Phase 1 (items 1-7), re-run this analysis to measure regression.
