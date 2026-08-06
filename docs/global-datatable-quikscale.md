# Global `DataTable` Component — QuikScale Usage, Change Report & Reusability Analysis

**Branch:** `quikscale/ProdBug-OPSP`
**Shared component:** `packages/ui/components/data-table.tsx` (`@quikit/ui` → `DataTable`)
**Prepared for:** review / handoff before merge
**Date:** 2026-07-21

---

## 1. Executive Summary

QuikScale renders its OPSP Review tables on top of the **shared global `DataTable`** primitive that
lives in `packages/ui` (`@quikit/ui`). For the OPSP Review work on this branch, those tables needed
the same **per-user column features** (sort, hide, freeze, resize, drag-to-reorder) that the rest of
QuikScale already has.

To enable that, we made **exactly one change to the global component**:

> We added a single DOM attribute — **`data-col-key={col.key}`** — to each `<th>` header cell.

**Everything else** (sort logic, drag-reorder, hide/freeze/resize, group-aware sorting, preference
persistence) was built **inside QuikScale** as wrapper code around the global component. It did
**not** touch `@quikit/ui`. This keeps the global component reusable and safe for every other app.

This document answers four questions in plain terms:

1. **What** does QuikScale use from the global table? *(§2–3)*
2. **What** did we change and **why is it necessary**? *(§4–5)*
3. **Do other apps also depend on the global table / these features?** *(§6)*
4. **Is it feasible to change the global component — or should each app write its own?**
   *(§7 — the core trade-off you asked about)*

---

## 2. What the Global `DataTable` Provides

`DataTable<T>` is a small (**208 lines**), presentational, **"dumb" primitive**. It renders only; it
holds **no business logic and no data-fetching**.

| Concern | In the global `DataTable`? | Notes |
|---|---|---|
| Column definition (`key`, `label`, `width`, `align`, `render`) | ✅ Yes | `DataTableColumn<T>` |
| Fixed-layout rendering + `<colgroup>` widths | ✅ Yes | `tableLayout: fixed` |
| Sticky header (`stickyHeader`) | ✅ Yes | default `true` |
| Sticky / frozen columns (`sticky`, `stickyZ`) + left-offset math | ✅ Yes | `stickyOffsets` |
| Per-row / per-cell class hooks (`rowClassName`, `tdClassName`) | ✅ Yes | string or function |
| Empty state (`emptyMessage`, `emptyColSpan`) | ✅ Yes | |
| Shared header/cell styling (`TH_BASE`, `TD_BASE`) | ✅ Yes | `bg-accent-50` header theming |
| **Sorting** | ❌ No | caller supplies sorted `data` |
| **Pagination** | ❌ No | separate `Pagination` component + server paging |
| **Column hide / freeze / resize / drag** | ❌ No | caller composes on top |
| **Data fetching / preferences** | ❌ No | app concern |

> **Design intent:** the global `DataTable` is deliberately minimal. All *interactive behaviour* is
> layered on by the consuming app. This is precisely why QuikScale can add rich features **without
> changing the shared file** — and it is central to the feasibility discussion in §7.

---

## 3. What QuikScale Consumes From `@quikit/ui`

QuikScale imports from `@quikit/ui` across ~48 files. The table-related pieces:

- **`DataTable`, `DataTableColumn<T>`** — the primitive (OPSP Review primary/secondary tables).
- **`ColMenu`** — shared hover ⋮ header menu (Sort / Freeze / Hide).
- **`Pagination`** — shared paging control (used by `FeatureGrid`).
- **`TH_BASE` / `TD_BASE`** — shared header/cell style constants.
- **`useConfirm`** — confirm dialog for freeze-crossing prompts.

QuikScale then builds **its own wrappers** on top — these live entirely in `apps/quikscale`, **never**
in the shared package:

| QuikScale wrapper | File | Role |
|---|---|---|
| `useDataTableGrid` | `components/table/useDataTableGrid.tsx` | Adds column features (sort/hide/freeze/resize/drag) to any `DataTable` page. **New this branch.** |
| `FeatureGrid` | `components/table/FeatureGrid.tsx` | Full config-driven grid: column features + row drag + server pagination. |
| `groupSort` | `lib/utils/groupSort.ts` | Group-aware stable sort for grouped OPSP rows. **New this branch.** |
| `useTablePrefs`, `useColumnOrder`, `useColumnResize`, `useColumnDnD`, `useRowDnD`, `useStickyOffsets` | `lib/hooks/*` | Per-user preference persistence + interactions. |

> The 4 **locked** tables (KPI / Priority / WWW / Client-Meetings) do **not** use the global
> `DataTable` — they render bespoke markup (see `CLAUDE.md` → *Locked Tables*) and already carry their
> own `data-col-key`.

---

## 4. The Change Made to the Global Component

### 4.1 The diff (this is the whole change to the shared file)

`packages/ui/components/data-table.tsx`:

```diff
             return (
               <th
                 key={col.key}
+                data-col-key={col.key}
                 className={[
                   TH_BASE,
                   !isLast && "border-r",
```

**One attribute, on the header cell only.** Nothing else in the shared package changed.

### 4.2 Why it is necessary (explained simply)

QuikScale's drag-reorder and frozen-column features do **not** read a JavaScript array to find which
column is which. They read the **live DOM** — they look at the actual `<th>` elements on screen and
ask each one *"which column key are you?"*. They do that by reading the `data-col-key` attribute:

```ts
// apps/quikscale/lib/hooks/useColumnDnD.tsx  (drag-to-reorder)
const cells = row.querySelectorAll<HTMLElement>("th[data-col-key]");
```

```ts
// apps/quikscale/lib/hooks/useStickyOffsets.ts  (frozen-column left offsets)
const ths = row.querySelectorAll<HTMLElement>("th[data-col-key]");
```

Every other QuikScale grid header already prints `data-col-key` (KPI, Priority, WWW, FeatureGrid,
Client-Meetings pages). But the **shared `DataTable` did not print it.** So a page built on the shared
`DataTable` produced headers the hooks **could not recognise** — the query returned **zero cells**,
and the features **silently did nothing** (no error, they just didn't work).

**In one line:** without `data-col-key` on the shared header, OPSP Review's drag-reorder and
frozen-column math have nothing to grab onto. Adding it lets any page using the shared `DataTable`
join the exact same feature stack as the rest of the app.

### 4.3 Why this change is safe for every app

- **Additive & inert.** `data-*` attributes are valid HTML that do nothing on their own. No prop,
  type, CSS class, or render path changed.
- **Opt-in.** An app only benefits if it *chooses* to query for the attribute. Apps that don't (see
  §6) are completely unaffected — the attribute just sits in the DOM, unread.
- **No API change.** `DataTableProps<T>` and `DataTableColumn<T>` are unchanged → no downstream
  TypeScript breaks.
- **More consistent, not less.** QuikScale's own tables already use this convention; the shared
  component now matches them.

---

## 5. Use Case — OPSP Review Tables

The OPSP Review screen (`apps/quikscale/app/(dashboard)/opsp/review/`) renders **read-only reporting
tables**: a grouped **Primary** table (one category spans several period sub-rows), a flat
**Secondary** table, and the **Critical #** review cards.

Reviewers needed the same column ergonomics as everywhere else — sort, hide, freeze, resize,
drag-reorder — with each user's choices **remembered**. Because these are reports, they need **only
column features**: no row-drag, no trash, no pagination. That is exactly the scope of the new
`useDataTableGrid` hook.

### 5.1 Example — grid + features

```tsx
// apps/quikscale/app/(dashboard)/opsp/review/page.tsx
import { DataTable } from "@quikit/ui";
import { useDataTableGrid, type GridColumn } from "@/components/table/useDataTableGrid";

// 1. Describe columns once — mark which are sortable and how to rank them.
const primaryColumns: GridColumn<TableRow>[] = useMemo(() => [
  { key: "_cb", label: <SelectAllCheckbox /> },              // rail column (never hidden/dragged)
  {
    key: "category", label: "Category", width: 200,
    sortable: true, sortAccessor: (row) => row.category,     // ranking value
    render: (row) => <span>{row.category}</span>,
  },
  {
    key: "target", label: "Target", width: 100, align: "right",
    sortable: true, sortAccessor: (row) => row.target,
    render: (row) => <span>{formatReviewValue(row.target, row.dataType, row.currency)}</span>,
  },
  // …achieved, gap, achievedPct, lastYearAchieved, yearGrowth …
], [/* deps */]);

// 2. Feed columns through the wrapper — it returns transformed columns + a sorter.
const grid = useDataTableGrid<TableRow>({
  table: "opspReviewPrimary",          // preference bucket (persisted per user)
  columns: primaryColumns,
  railKeys: ["_cb", "_log", "_id"],    // pinned rail — never hidden/sorted/dragged
});

// 3. Sort the rows (group-aware) and render with the UNMODIFIED global DataTable.
const sortedRows = grid.applySort(filteredRows, (row) => row.rowIndex);

return (
  <div ref={grid.containerRef}>
    <DataTable columns={grid.columns} data={sortedRows} rowKey={(r) => r.id} />
  </div>
);
```

`useDataTableGrid` wraps each header with the drag handle, freeze icon, `ColMenu`
(sort/freeze/hide) and resize handle, then hands the result straight to the **unchanged** global
`DataTable`. The global component just renders what it's given.

### 5.2 Example — group-aware sort (`groupSort.ts`)

The primary table is **grouped**: one category spans several period sub-rows that must stay together.
A plain sort would scramble them. `sortGroups` reorders whole **groups** by a group-level value,
preserves intra-group order, and pushes blanks last:

```ts
sortGroups(rows, (row) => row.rowIndex, (groupRows) => accessor(groupRows[0]), "asc");
```

### 5.3 Example — pagination (for contrast)

The global `DataTable` has **no** pagination. Where QuikScale needs paging it uses the shared
`Pagination` control + server-side paging, bundled inside `FeatureGrid`:

```tsx
import { Pagination } from "@quikit/ui";
// server: const items = await db.kpi.findMany({ where: { orgId }, ...paginationToSkipTake(params) });
```

OPSP Review **intentionally** skips pagination — it is a full-page report.

---

## 6. Do Other Apps Use the Global Table & These Features?

This is important for judging the blast radius of any global change. The reality across the monorepo
is **mixed** — and it directly illustrates your concern about duplicated code:

| App | Table approach | Uses shared `@quikit/ui` `DataTable`? | Size |
|---|---|---|---|
| **quikscale** | Shared primitive **+ wrapper hooks** | ✅ Yes | 208-line shared + thin wrappers |
| **quikinfra** | **Its own** `components/DataTable.tsx` | ❌ No — fully local copy | **1,446 lines** |
| **quikfinance** | **Its own** `components/shared/DataTable.tsx` | ❌ No — fully local copy | **341 lines** |

**What this tells us:**

- The **`data-col-key` change only affects consumers of the shared primitive** — today that is
  **QuikScale**. quikinfra and quikfinance render their **own** table components, so they are
  **completely unaffected** by our change. (Worst-case blast radius is therefore very small.)
- But it also exposes the **real cost of the "dumb primitive" model**: because the shared `DataTable`
  ships *no* built-in sort/filter/freeze/hide/resize, quikinfra had to **re-implement all of those
  from scratch** — **1,446 lines** — and quikfinance wrote **yet another** **341-line** version.
  That is the *"same code again and again"* problem, already living in the repo.

So the honest picture is: the shared component is reused for **rendering**, but the **feature logic**
has been re-written per app because it was never shared. QuikScale is the first app to add those
features **without** forking the primitive — by layering wrappers on top of it.

---

## 7. Feasibility — Change the Global Component, or Write It Per-App? ⚠️

This is the central decision you raised: *if we keep everything app-local, we re-write the same code
again and again; if we push it into the global component, is that feasible and safe?*

### 7.1 The trade-off in plain terms

| | **Change the global component** | **Keep it per-app (duplicate)** |
|---|---|---|
| **Code reuse (DRY)** | ✅ Write once, every app benefits | ❌ Same logic re-written N times (quikinfra 1,446 + quikfinance 341 lines prove this) |
| **Consistency** | ✅ All apps behave/look the same | ❌ Each app drifts (different sort rules, keyboard behaviour, bugs) |
| **Maintenance** | ✅ One fix fixes everyone | ❌ Fix the same bug in every app separately |
| **Blast radius / risk** | ⚠️ A bad change breaks **all** apps at once | ✅ A change touches only one app |
| **Release coupling** | ⚠️ Shared change redeploys every app on `main` | ✅ Independent releases |
| **Flexibility for one app's odd need** | ❌ Hard — must not break others | ✅ Total freedom locally |

### 7.2 The rule this branch follows (recommended)

We resolved the trade-off with a **layered** rule that captures the DRY benefit **without** the
blast-radius risk:

> **Global component = only app-neutral, additive capability.**
> **App-specific behaviour = wrapper code inside the app.**

- The **one** thing we put in the shared file (`data-col-key`) is **useful to any app and harmful to
  none** — it is a hook point, not behaviour. That is the *only* kind of change that belongs there.
- **All** the actual QuikScale behaviour (sort/hide/freeze/drag, group sort, preferences) sits in
  `apps/quikscale/**`. So we did **not** re-fork the 208-line primitive, **and** we did **not** force
  quikinfra/quikfinance to adopt anything.

This is why we could add rich features to QuikScale tables **without re-testing or re-deploying**
quikinfra / quikfinance / quikcrm.

### 7.3 Decision guide — "should this go in the global component?"

Before editing `packages/ui`, ask, in order:

1. **Would every app benefit, or at least be unharmed?** If no → keep it app-local.
2. **Is it additive (new optional prop / attribute / default)?** If it renames/removes/changes
   existing behaviour → it is **breaking**; do not do it casually (see §7.4).
3. **Is it behaviour, or just a hook point?** Neutral hook points (like `data-col-key`) are ideal for
   the shared layer. App-specific *behaviour* (a particular sort rule, a business filter) is not.
4. **Could a wrapper achieve the same thing?** If yes, prefer the wrapper (that is the
   `useDataTableGrid` / `FeatureGrid` pattern).

**Long-term option (optional, future):** if quikinfra + quikfinance + quikscale keep needing the same
features, the *right* DRY move is to **promote the shared logic into `@quikit/ui`** as an optional,
opt-in layer (e.g. a `useDataGrid` hook or feature flags on `DataTable`), then retire the two local
copies. That would remove ~1,700 lines of duplication — but it is a **deliberate, tested migration**,
not a side-effect of a bug-fix branch. Not in scope here; noted as a recommendation.

### 7.4 What is safe vs. unsafe to change in the global component

| Change type | Safe? | Reason |
|---|---|---|
| Add a neutral `data-*` attribute (like `data-col-key`) | ✅ Safe | Additive, inert, opt-in per app |
| Add a **new optional** prop with a default | ✅ Safe | Existing callers unaffected |
| Add a new optional column field | ✅ Safe | Backward compatible |
| Rename / remove a prop or column field | ❌ **Breaking** | Breaks every app's typing/render |
| Change default styling (`TH_BASE`/`TD_BASE`, row hover) | ⚠️ Risky | Restyles **all** apps at once |
| Change sticky-offset math or DOM structure | ⚠️ Risky | Other consumers may depend on layout |
| Inject app-specific behaviour (sort/paginate/fetch) | ❌ Do not | Belongs in the consuming app |

### 7.5 Coupling points to keep in sync if QuikScale table code is rewritten

1. **`data-col-key` must stay on every header cell.** `useColumnDnD` and `useStickyOffsets` hit-test
   `th[data-col-key]`. If a future refactor of the shared `DataTable` drops it, OPSP Review
   drag-reorder and frozen offsets **break silently**. ➜ Guard with a test.
2. **`useDataTableGrid` depends on the shared `DataTable`'s DOM shape** — headers inside one
   `thead tr`, exposing `th[data-col-key]`. Structural changes to the shared component (header
   wrapping, row virtualization) must be validated against OPSP Review.
3. **Preference buckets are additive and must be registered in two places** —
   `lib/hooks/useTablePreferences.ts` **and** `lib/schemas/tablePreferencesSchema.ts`. The schema is
   the server-side save gate; a bucket missing there is **rejected on save**. Always update both.
4. **Do not migrate the 4 locked tables** (KPI / Priority / WWW) onto `DataTable`/`useDataTableGrid` —
   they are colour-locked (`CLAUDE.md`) and keep their own markup + `data-col-key`.
5. **Feature scope is intentional.** `useDataTableGrid` = column features only. If a report later
   needs row-drag / trash / pagination, use `FeatureGrid`, don't overload `useDataTableGrid`.

### 7.6 Testing requirement (per `CLAUDE.md`)

This is a `ProdBug-OPSP` bug-fix branch. Repo rule: **every bug fix ships with a regression test**,
and a new `lib/utils/` utility needs **≥90% line coverage**. Confirm `groupSort` has its own unit
test and OPSP Review component tests cover the new sort/hide/freeze wiring before merge.

---

## 8. Changes Done On This Branch (Checklist)

### 8.1 Global / shared package — `packages/ui`
- ✅ `components/data-table.tsx` — added `data-col-key={col.key}` on the header `<th>`.
  **(Only shared-package change. Additive, non-breaking, affects QuikScale only.)**

### 8.2 QuikScale app — `apps/quikscale`
- 🆕 `components/table/useDataTableGrid.tsx` — new hook: column features (sort/hide/freeze/resize/drag)
  for `DataTable`-based pages.
- 🆕 `lib/utils/groupSort.ts` — new group-aware stable sort utility.
- ✏️ `app/(dashboard)/opsp/review/page.tsx` — primary/secondary tables migrated from raw
  `DataTableColumn` to `GridColumn` + `useDataTableGrid`; added `sortable` + `sortAccessor` to
  Category, Category Type, Target, Achieved, Gap, %, Last-Year, Growth, Who, etc.
- ✏️ `app/(dashboard)/opsp/review/CriticalTable.tsx` — per-column **show/hide** on the Critical #
  cards via the shared `ColMenu` (Hide-only; card layout has no sort/freeze).
- ✏️ `lib/hooks/useTablePreferences.ts` — registered 3 new buckets: `opspReviewPrimary`,
  `opspReviewSecondary`, `opspReviewCritical`.
- ✏️ `lib/schemas/tablePreferencesSchema.ts` — same 3 buckets added to the server-side allow-list.

### 8.3 Net effect
- The shared table stays reusable and safe for **all** apps (one inert attribute).
- OPSP Review tables now match the rest of QuikScale's grid ergonomics.
- Per-user column preferences persist for the 3 new OPSP Review surfaces.
- **No** duplication of the primitive; **no** impact on quikinfra / quikfinance.

---

## 9. Recommendation

1. **Keep the boundary this branch drew:** global component grows only **app-neutral, additive**
   capability; **all** app-specific behaviour lives in `apps/quikscale` wrappers.
2. **Before touching `@quikit/ui`, run the §7.3 checklist.** If the change isn't useful-to-all and
   additive, put it in a wrapper instead.
3. **Longer term (separate initiative):** consider promoting the shared feature logic into `@quikit/ui`
   as an opt-in layer so quikinfra's 1,446-line and quikfinance's 341-line local copies can be retired
   — a deliberate, tested migration, not a bug-fix side-effect.
