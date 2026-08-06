# Root Cause Analysis — Dashboard Not Reflecting Edits Made in Modules

| | |
|---|---|
| **Title** | Dashboard does not show latest values after editing KPI / Priority / WWW records |
| **Document status** | Final |
| **Date raised** | 24 July 2026 |
| **Date resolved** | 24 July 2026 |
| **Severity** | Medium — incorrect information displayed; **no data loss or data corruption** |
| **Affected area** | QuikScale → Dashboard (KPI Overview, KPI / Priority / WWW tables) |
| **Prepared for** | Client stakeholders |

---

## 1. Executive summary

When a user edited a record in a module — for example, changing a **Target Value** in Individual KPI, or updating a **status / weekly value** in KPI, Priority, or WWW — the **Dashboard continued to display the old value**. The change only appeared after the user manually clicked **Reload** or navigated away and back to the Dashboard.

**Important:** the data was always saved correctly. The database and the module pages always showed the correct, updated value. The problem was limited to the Dashboard's on-screen view, which was showing a **cached (stale) copy** and was not being told to refresh itself automatically.

The issue has been fully diagnosed and fixed. After the fix, an edit made anywhere in KPI, Team KPI, Priority, or WWW is reflected on the Dashboard immediately, with no manual reload required. Automated regression tests were added to prevent the problem from recurring.

---

## 2. Symptoms observed

- Editing a KPI **Target Value** in Individual KPI did not update the Dashboard's KPI figures.
- Inline edits to **WWW** (status, revised date, notes) did not appear on the Dashboard.
- Inline **weekly status** edits to **Priority** updated the Dashboard's summary but not the Dashboard's Priority table.
- In every case, the value was correct on the module page and after a manual **Reload** of the Dashboard.

---

## 3. Business impact

- **User trust / data confidence:** Users saw contradictory numbers between a module page and the Dashboard, which undermines confidence in the reported figures.
- **Operational friction:** Users had to manually reload or re-navigate to see accurate Dashboard data.
- **No data integrity impact:** No records were lost, overwritten, or saved incorrectly. Every value was persisted correctly; only the Dashboard's temporary on-screen cache lagged behind.

---

## 4. Root cause analysis

The Dashboard is a high-performance screen that avoids re-downloading data on every interaction by keeping a short-lived in-memory **cache** of what it has already loaded. When a record is edited elsewhere, the application is responsible for telling that cache "this data is now out of date — refresh it." Two independent defects in that notification mechanism combined to cause the symptom.

### Root cause #1 — The Dashboard reads from two caches, and some edits refreshed neither

The Dashboard is fed by **two separate data sources**:

1. A **summary** feed that drives the KPI Overview cards.
2. Three **table** feeds that drive the KPI, Priority, and WWW tables.

For a change to appear everywhere, an edit must refresh the module's own list **and both** Dashboard feeds. A shared routine exists to do exactly this. However, several **inline edit actions** bypassed it:

- **WWW** inline edits (status, revised date, notes) refreshed **only the screen currently open** and did not notify the Dashboard's caches at all.
- **Priority** inline weekly-status edits refreshed the Dashboard summary but **omitted the Dashboard's Priority table cache** (it targeted a similarly-named but different cache key).
- **Row-reorder** actions in all three tables refreshed only the current screen.

Because these tables are the *same component* reused on both the module page and the Dashboard, an edit performed on a module page never reached the Dashboard's copy of the data.

### Root cause #2 — Correct edits only *flagged* the Dashboard stale; they did not *refresh* it

Even for edit paths that were wired correctly (for example, the KPI edit form), the refresh instruction used the framework's **default behaviour**, which only refreshes screens that are **currently open**. While a user edits on a module page, the Dashboard is not open, so its cache was merely **marked "stale"** rather than actively refreshed.

The consequence: the Dashboard would only fetch fresh data the *next* time the user opened it — and only if certain timing conditions were met. To the user, the edit "didn't show up." This is the most likely explanation for the reported KPI **Target Value** symptom, because that edit path was otherwise correctly wired, and the server-side APIs perform no caching of their own (ruling out a backend cause).

### Contributing factors

- The two-cache design (summary + tables) is efficient but requires every edit path to refresh both; a single missed path produces exactly this class of bug.
- Inline (in-grid) edits and full-form edits used different refresh code paths, so a fix applied to one did not automatically protect the other.

---

## 5. Resolution

Two targeted changes were made, addressing each root cause directly:

1. **Force an active refresh (fixes Root cause #2).**
   The shared refresh routine was changed so that when any KPI / Priority / WWW record is edited, the Dashboard's caches are **refreshed immediately in the background** — even when the Dashboard is not the screen currently on view. The Dashboard is therefore already up to date the instant the user switches to it (and updates live if it is already open).

2. **Route every edit through the shared refresh routine (fixes Root cause #1).**
   All inline edit actions — WWW status / revised-date / notes, Priority weekly-status, and row-reorders in all three tables — were updated to call the same shared routine used by the edit forms. This guarantees that **any field, edited from any screen, refreshes both Dashboard feeds and the module list**.

**Net effect:** An edit to any field in Individual KPI, Team KPI, Priority, or WWW is now reflected across every Dashboard column automatically, with no manual reload.

---

## 6. Verification & testing

The fix was verified with automated regression tests, so the behaviour is protected against future changes:

- A test that proves an edit **actively refreshes** the Dashboard's data feeds even when the Dashboard is not open (directly reproducing and validating the fix for Root cause #2).
- Tests that drive the actual inline edit controls for **WWW** (status, revised date, notes) and **Priority** (weekly status) and confirm each one now refreshes the Dashboard.
- A negative test confirming a **failed save** does not trigger a false "success" refresh.
- Confirmation that an edit to one module does not needlessly refresh unrelated modules.

All fix-related tests pass. The change was also validated to introduce no type-safety regressions.

---

## 7. Preventive measures

- **Single source of truth for refresh logic:** All edit paths now funnel through one shared routine, so future modules inherit correct behaviour by default and cannot silently drift.
- **Automated regression coverage:** The new tests will fail immediately if any future change reintroduces a missed refresh path.
- **Documented standard:** The requirement — *"every record edit must refresh the module list and both Dashboard feeds, and must actively refresh, not merely flag stale"* — has been recorded as an internal engineering convention for the Dashboard.

---

## 8. Recommendations for the client

- **No action is required from users.** The fix is transparent; the Dashboard now stays current automatically.
- No historical data needs correction — stored values were always accurate; only the temporary on-screen view was affected.

---

## Appendix A — Technical detail (for engineering audiences)

**Technology:** React with TanStack Query (React Query) for client-side data caching.

**The two Dashboard data families:**
- Summary feed: query key `["dashboard", "summary", …]` (KPI Overview cards).
- Table feeds: query keys `["kpi-infinite"]`, `["priority-infinite"]`, `["www-infinite"]`.
- Module pages use their own keys, e.g. `["kpi","list", …]`.

**Shared invalidation helper:** `invalidateEntity(queryClient, entity, { id })` in
`apps/quikscale/lib/hooks/dashboardInvalidation.ts`. It invalidates
`[entity,"list"]`, `[entity-infinite]`, `["dashboard"]`, and `[entity,"detail",id]`.

**Root cause #1 — bypassed / incomplete invalidation:**
- `WWWTable` inline handlers (`handleStatusSave`, `handleRevisedDateSave`, `handleNotesSave`) performed a raw `PUT` followed only by the parent's `onRefresh()` — no cache invalidation.
- `PriorityTable` inline weekly-status handler invalidated `["priority"]` + `["dashboard"]` but **not** `["priority-infinite"]` (in React Query, `["priority"]` does not prefix-match `["priority-infinite"]`).
- Row-reorder handlers in all three tables called only `onRefresh()`.

**Root cause #2 — refetch type:**
`invalidateQueries` defaults to `refetchType: "active"`, which refetches only mounted (active) queries and leaves inactive ones merely marked stale. While editing on a module page, the Dashboard's queries are inactive, so they were not refetched until the next mount.

**Fix:**
- `invalidateEntity` now passes `refetchType: "all"`, forcing inactive Dashboard queries to refetch in the background on any edit.
- All inline handlers in `WWWTable.tsx`, `PriorityTable.tsx`, and `KPITable.tsx` now call `invalidateEntity(...)` with the affected `id`.

**Files changed:**
- `apps/quikscale/lib/hooks/dashboardInvalidation.ts`
- `apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx`
- `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx`
- `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`

**Confirmed non-cause:** The server APIs (`/api/dashboard/summary`, `/api/kpi`, `/api/priority`, `/api/www`) apply no response caching; the defect was entirely client-side cache refresh.
