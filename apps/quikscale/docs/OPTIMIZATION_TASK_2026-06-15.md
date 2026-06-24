# QuikScale Optimization Task — 2026-06-15

**Branch:** `quikscale/optimize-15-06-26`
**Owner:** rohit.deshmukh@moreyeahs.com
**Scope:** Two tracks — (A) DB / Prisma query performance, (B) Frontend / React rendering performance.

---

## 1. Objective

Reduce server response payloads and database load on QuikScale's list/analytics endpoints, and cut unnecessary re-renders on the heavy dashboard tables (KPI, Priority, WWW) and the OPSP page. Target measurable wins:

- **API:** smaller JSON payloads + fewer/cheaper queries on the Performance module and other list routes.
- **Frontend:** fewer wasted re-renders on tables of 50–200 rows; faster modal/picker interactions.

Both tracks follow existing project standards (see [`CLAUDE.md`](../../../CLAUDE.md)):
- Lists use Prisma `select` (not `include`); detail endpoints may use `include`.
- Always filter by `tenantId`.
- Use shared pagination from `@quikit/shared/pagination`.
- The 4 LOCKED tables (KPI / Team KPI / Priority / WWW) must **not** have cell colors changed — this task touches their **render structure only** (memoization, component extraction), never the `blue-*`/`gray-*`/semantic cell classes.

---

## 2. Acceptance Criteria

- [ ] No list endpoint uses `include: true` on a relation where only a handful of fields are rendered — replaced with explicit `select`.
- [ ] Performance module endpoints stop loading full `weeklyValues` / `weeklyStatuses` arrays (52+ rows/record) when only aggregate fields are needed.
- [ ] Every `findMany` that can return an unbounded list is paginated (`skip`/`take` via the shared utility) — or has a documented reason it's safe.
- [ ] Heavy tables extract memoized row/cell components so a single-row interaction (status picker, selection) no longer re-renders all rows.
- [ ] Inline `.map`/`.filter`/`.sort` chains in render are wrapped in `useMemo` with correct deps.
- [ ] **Each change ships with a test** — regression test for query-shape changes (assert selected fields / pagination), and the existing DOM tests stay green for table refactors.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all pass; coverage ratchet not breached.
- [ ] Locked-table cell styling is byte-for-byte unchanged (verify with `git diff` on the 4 files — only structural/JSX moves, no class string edits to `<td>`).

---

## 3. Track A — DB / Prisma Query Optimization

Ordered by impact. Each item: file → issue → fix.

### A1. Performance Scorecard — over-fetches all weekly data *(CRITICAL)*
- **File:** [`app/api/performance/scorecard/route.ts`](../app/api/performance/scorecard/route.ts) (~L11–12)
- **Issue:** Fetches every `weeklyValues` + `weeklyStatuses` row for all org KPIs/Priorities, then filters in JS by `healthStatus`/`progressPercent`. No pagination.
- **Fix:** `select` only `{ id, healthStatus, progressPercent }` for KPIs and `{ id, overallStatus }` for Priorities. Drop weekly relations entirely.

### A2. Performance Trends — weekly arrays loaded then filtered in JS
- **File:** [`app/api/performance/trends/route.ts`](../app/api/performance/trends/route.ts) (~L12–15, L52–55)
- **Issue:** Loads full `weeklyStatuses` / `weeklyValues`, post-processes in JS; filters weekNumber client-side.
- **Fix:** `select` aggregate fields for priorities; push `where: { weekNumber: { gte, lte } }` to the DB for the KPI weekly trend.

### A3. Performance Individual (list) — full weekly includes, no limit
- **File:** [`app/api/performance/individual/route.ts`](../app/api/performance/individual/route.ts) (~L40–51)
- **Issue:** `include: { kpisOwned: { include: { weeklyValues: true }}, prioritiesOwned: { include: { weeklyStatuses: true }}}` for every user.
- **Fix:** `select: { id, progressPercent, overallStatus }` on related models. Consider caching computed scores if hot.

### A4. Performance Teams — nested user→KPI/Priority full records
- **File:** [`app/api/performance/teams/route.ts`](../app/api/performance/teams/route.ts) (~L25–36)
- **Issue:** `include: { members: { include: { user: { include: { kpisOwned, prioritiesOwned }}}}}`; no pagination on teams.
- **Fix:** `select` only `progressPercent` / `overallStatus` from related KPIs/Priorities.

### A5. Performance Talent — recursive full-model includes
- **File:** [`app/api/performance/talent/route.ts`](../app/api/performance/talent/route.ts) (~L26–62)
- **Issue:** Deeply nested `include` of kpisOwned/prioritiesOwned/talentAssessed/reviewsReceived/etc. with full fields (paginated, but heavy transfer).
- **Fix:** Replace nested includes with field-level `select`.

### A6. Performance Review detail / Individual detail — 52-week weekly loads
- **Files:** [`app/api/performance/reviews/[reviewId]/route.ts`](../app/api/performance/reviews/[reviewId]/route.ts) (~L12–20), [`app/api/performance/individual/[userId]/route.ts`](../app/api/performance/individual/[userId]/route.ts) (~L9–18)
- **Issue:** Detail endpoints load all 52 weekly rows per KPI/Priority + full `reviewer` record.
- **Fix:** `select` current-quarter weekly summary only; trim reviewer to `{ id, firstName, lastName }`.

### A7. Performance Reviews (list) — full User records
- **File:** [`app/api/performance/reviews/route.ts`](../app/api/performance/reviews/route.ts) (~L14–26)
- **Fix:** `reviewer`/`reviewee` → `select: { id, firstName, lastName, avatar }`.

### A8. Surveys (list) — no pagination + full questions array
- **File:** [`app/api/surveys/route.ts`](../app/api/surveys/route.ts) (~L16–28)
- **Fix:** Add `skip`/`take`; defer full `questions` array to the detail endpoint.

### A9. FACe / PACe — recursive `include: true` on assignedTo
- **Files:** [`app/api/face/route.ts`](../app/api/face/route.ts) (~L10–22), [`app/api/pace/route.ts`](../app/api/pace/route.ts) (~L10–22)
- **Fix:** `assignedTo`/`childFunctions.assignedTo` → `select: { id, firstName, lastName, email }`.

### A10. Client Meetings weekly-meetings — full member records
- **File:** [`app/api/client-meetings/weekly-meetings/route.ts`](../app/api/client-meetings/weekly-meetings/route.ts) (~L82–91)
- **Fix:** `absentTeamMembers.member` → `select: { id, name }`.

### A11. Org Teams — post-query head-name lookups (lower priority)
- **Files:** [`app/api/org/teams/route.ts`](../app/api/org/teams/route.ts) (~L58–65), [`app/api/org/teams/[id]/members/route.ts`](../app/api/org/teams/[id]/members/route.ts) (~L95–100)
- **Fix:** `include: { head: { select: { id, firstName, lastName }}}` in the main query instead of a second `findMany`.

> **Note:** [`app/api/org/users/route.ts`](../app/api/org/users/route.ts) already uses the good `select` pattern on `qsUserTeams.team` — leave as-is (only trim further if profiling shows it matters).

---

## 4. Track B — Frontend / Rendering Optimization

The big three tables share the same anti-pattern: a single top-level `.map()` over all rows, nested `.map()`s per row, and `.filter()`s recomputed every render — so any local interaction (selecting a row, opening a status picker, resizing a column) re-renders the entire table.

### B1. KPITable — extract & memoize row + cell components *(CRITICAL)*
- **File:** [`app/(dashboard)/kpi/components/KPITable.tsx`](../app/(dashboard)/kpi/components/KPITable.tsx)
- **Issues:**
  - L315–694: top-level `kpis.map()` with nested `visibleWeekCols`/`owners` maps; no row memoization.
  - L81, L102: `ALL_WEEKS.map`, `kpis.map(k=>k.id)` recomputed inline (destabilizes `useTableColumns` deps).
  - L130–131: `visibleStaticCols`/`visibleWeekCols` `.filter()` every render.
  - L250–303: header `.map()` calls `getColWidth()` per cell, no memo.
  - L643: per-row owner breakdown computed 13× per row inline.
- **Fix:** Extract `<KPITableRow>` + `<KPIWeekCell>` + `<HeaderCell>`, wrap in `React.memo`; `useMemo` the week-key array, id array, and visible-column filters; hoist owner breakdown into the existing `rowDerived` memo.
- **Constraint:** cell color classes unchanged (LOCKED table — structure only).

### B2. PriorityTable — extract memoized `<PriorityRow>`
- **File:** [`app/(dashboard)/priority/components/PriorityTable.tsx`](../app/(dashboard)/priority/components/PriorityTable.tsx)
- **Issues:** L549–838 row map + nested week cells (L785); L375–376 `visibleWeeksList`/`COL_ORDER` filters; L239 `new Set(priorities.map(...))` on every render.
- **Fix:** Extract `<PriorityRow>` (`React.memo`); `useMemo` the filters and the id set.

### B3. WWWTable — memoize id set + column order
- **File:** [`app/(dashboard)/www/components/WWWTable.tsx`](../app/(dashboard)/www/components/WWWTable.tsx)
- **Issues:** L325 `new Set(items.map(...))`; L280 `WWW_COL_ORDER_FULL.filter()` per render.
- **Fix:** `useMemo` both; extract memoized row if profiling shows row churn.

### B4. OPSP ActionsSection — extract memoized `<ActionRow>`
- **File:** [`app/(dashboard)/opsp/components/ActionsSection.tsx`](../app/(dashboard)/opsp/components/ActionsSection.tsx) (~L143–255)
- **Issue:** `form.actionsQtr.map()` renders each row with inline `<CategorySelect>`/`<ProjectedInput>`; whole list re-renders on any unrelated form-state change.
- **Fix:** Extract `<ActionRow>` with `React.memo`; pass stable `onChange` via `useCallback`.

### B5. OPSP pickers / currency dropdown — memoize filtered option lists
- **Files:** [`app/(dashboard)/opsp/categories/page.tsx`](../app/(dashboard)/opsp/categories/page.tsx) (~L100–144), [`app/(dashboard)/opsp/components/pickers.tsx`](../app/(dashboard)/opsp/components/pickers.tsx) (~L177)
- **Fix:** `useMemo` the `filtered` currency array (keyed by `search`); memoize/extract option components and precompute `fullName`.

---

## 5. Suggested Sequencing (one day)

1. **Morning — Track A quick wins (A1, A2, A3, A4):** the Performance module is the highest payload offender. `include → select`, drop weekly arrays. Add/adjust API tests asserting the new query shape and that weekly relations are no longer fetched.
2. **Midday — A5–A11:** sweep remaining `include: true` → `select`, add pagination to Surveys.
3. **Afternoon — Track B:** B1 (KPITable) first as the template, then B2/B3 reuse the pattern; finish with B4/B5 (OPSP). Run the existing `*.dom.test.tsx` suites after each table.
4. **End of day:** `npm run typecheck && npm run lint && npm run test`; review `git diff` on the 4 locked-table files to confirm zero cell-color changes; run coverage ratchet.

---

## 6. Testing Plan

- **Track A:** for each changed route, a test asserting the returned object shape contains only the selected fields (and that pagination params are honored). Reuse mocks per [`__tests__/helpers/mockDb.ts`](../__tests__/helpers/mockDb.ts) and `setSession` per [`__tests__/setup.ts`](../__tests__/setup.ts). Keep an unauth→401 + tenant-isolation test on any route touched.
- **Track B:** existing DOM tests (`KPITable`, `ObjectivesSection`, `ActionsSection`, `filter-picker`) must stay green; add a render-count assertion where practical (e.g. memoized row does not re-render when an unrelated row's state changes).

---

## 7. Risks / Guardrails

- **Locked tables:** structural refactor only — never touch `<td>` color classes or the semantics in [`lib/utils/colorLogic.ts`](../lib/utils/colorLogic.ts) / [`lib/utils/kpiHelpers.ts`](../lib/utils/kpiHelpers.ts).
- **`select` vs `include` behavior:** switching to `select` changes the returned type — update downstream TS types and any code that read now-dropped fields. `typecheck` will catch most.
- **Score computations:** Performance endpoints compute scores from weekly data in JS. Before dropping weekly arrays, confirm the aggregate (`progressPercent`/`overallStatus`) is persisted and equals the previously-computed value — otherwise compute the aggregate at the DB or keep a trimmed weekly select.
- **Pagination on Surveys/etc.:** confirm the frontend consumes the paginated envelope, not a bare array.
