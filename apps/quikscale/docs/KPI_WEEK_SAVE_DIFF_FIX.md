# KPI — "Saving one week wipes the rest to 0" fix

## Problem

When a user opens an Individual KPI's Edit drawer, types a value into a
single week (e.g. **Week 8**) and clicks **Save Changes**, every other
week in the same KPI is overwritten with `0` (red cells) on the listing
page — even weeks the user never touched.

Reproduction:

1. Open `/kpi`.
2. Open the Edit drawer for any KPI whose other weeks are empty
   (showing `—`).
3. Type a value into Week 8 only.
4. Click **Save Changes**.

Expected: only Week 8 is updated; weeks 1–7 and 9–13 stay as `—`.
Actual:   Weeks 1–7 and 9–13 all turn into `0` (red).

## Root cause

The Edit drawer's save handler iterated **all 13 weeks** and pushed a
row for every week into the batch payload — regardless of whether the
user changed that week. Untouched weeks were sent with `value: null`
in the batch.

The server batch endpoint
([apps/quikscale/app/api/kpi/[id]/weekly/batch/route.ts](../app/api/kpi/[id]/weekly/batch/route.ts))
then coerces `null` into `0` inside `upsertRow`:

```ts
const value = opts.value ?? 0;   // null → 0 here
```

So every "I didn't touch this week" row got persisted as a literal
`0` — wiping the column.

Two layers of the same bug were present:

1. **Past weeks**: the server's `canEditPastWeek` gate rejected
   past-week rows it received, surfacing as the misleading
   `"11 of 13 weeks failed: Editing past weeks is disabled"` banner
   even though the user only touched the current week.
2. **Current + future weeks**: untouched-but-sent rows silently
   succeeded with `0`, wiping previously-empty cells.

## Plan

Fix the client so it only sends weeks the user actually changed. Do
not change the server endpoint — other callers depend on it.

Two filters applied per row in the save loop, in
[apps/quikscale/app/(dashboard)/kpi/components/LogModal.tsx](../app/(dashboard)/kpi/components/LogModal.tsx):

1. **Past-week lock** — skip rows where `weekNumber < currentWeek`
   when the tenant's `canEditPastWeek` flag is off (default).
2. **Diff against a frozen snapshot taken at modal open** — only
   include weeks whose `value` or `notes` differ from the initial
   state captured when the drawer first rendered.

Effect:

- User updates only Week 8 → batch contains 1 row → other weeks
  untouched server-side.
- User clears a previously-saved week → diff detected → row
  included so the cell is reset.
- User opens, looks, closes without typing → batch is empty → save
  becomes a no-op.

## Execute

### File touched

Only one file changed:
[apps/quikscale/app/(dashboard)/kpi/components/LogModal.tsx](../app/(dashboard)/kpi/components/LogModal.tsx).

### Change 1 — import `useRef`

```diff
- import { useEffect, useState } from "react";
+ import { useEffect, useRef, useState } from "react";
```

### Change 2 — snapshot the initial weekly state at mount

Captured into refs so they don't follow subsequent state updates.

```tsx
const initialWeeklyStateRef = useRef<
  Record<number, { value: string; notes: string }>
>(weeklyState);

const initialTeamWeeklyStateRef = useRef<
  Record<string, Record<number, { value: string; notes: string }>>
>(teamWeeklyState);
```

`useRef(initialValue)` evaluates `initialValue` exactly once on mount
(after the lazy `useState` initializers have populated
`weeklyState` / `teamWeeklyState`). Subsequent edits to those state
maps don't mutate the ref, so the ref holds the "as-saved" snapshot
for the lifetime of the drawer.

### Change 3 — diff-based filter in the save loop

```tsx
const cellsDiffer = (
  cur: { value: string; notes: string } | undefined,
  prev: { value: string; notes: string } | undefined,
) =>
  (cur?.value ?? "") !== (prev?.value ?? "") ||
  (cur?.notes ?? "") !== (prev?.notes ?? "");

// Individual KPI
for (const w of ALL_WEEKS) {
  if (isPastWeekLocked(w)) continue;
  const cur  = weeklyState[w];
  const prev = initialWeeklyStateRef.current[w];
  if (!cellsDiffer(cur, prev)) continue;            // ← skip unchanged
  const { value, notes } = cur ?? { value: "", notes: "" };
  weeklyInputs.push({
    weekNumber: w,
    value: value !== "" ? parseFloat(value) : null,
    notes: notes || null,
  });
}

// Team KPI — same filter per owner per week
for (const ownerId of Object.keys(teamWeeklyState)) {
  if (!(canEditAnyOwner || ownerId === currentUserId)) continue;
  for (const w of ALL_WEEKS) {
    if (isPastWeekLocked(w)) continue;
    const cur  = teamWeeklyState[ownerId]?.[w];
    const prev = initialTeamWeeklyStateRef.current[ownerId]?.[w];
    if (!cellsDiffer(cur, prev)) continue;
    const { value, notes } = cur ?? { value: "", notes: "" };
    weeklyInputs.push({
      weekNumber: w,
      value: value !== "" ? parseFloat(value) : null,
      notes: notes || null,
      userId: ownerId,
    });
  }
}
```

## Not changed (intentional scope guard)

To honour the "don't affect other features" requirement, none of the
following were touched:

- The server endpoint `POST /api/kpi/[id]/weekly/batch` — other
  callers (single-week route, future automations, integration tests)
  see identical behaviour.
- The server's past-week gate, permission checks, and
  team↔individual sync logic — preserved.
- `useUpdateKPI` / `useUpdateWeeklyValuesBatch` hooks — only carry
  the existing `skipListInvalidate` option that was added in the
  prior fix; their default behaviour is unchanged.
- `KPIModal` (Team KPI create/edit) — uses its own save flow with
  cascades; not affected.
- The single-week mutation (`useUpdateWeeklyValue`) used by inline
  cell edits — not affected.
- The Notes tab, Stats tab, Logs tab — not affected.
- KPI listing, filters, sort, search — not affected.
- All other modules (OPSP, Priority, WWW, Dashboard, etc.) — not
  affected.
- Typecheck (`npm run typecheck --workspace=quikscale`) — passes.

## Verification

1. `cd apps/quikscale && npm run dev`.
2. Open `/kpi`.
3. Pick a KPI whose other weeks are empty (`—`).
4. Open Edit drawer → Updates tab.
5. Type a value into Week 8 only.
6. **Network tab**: when you click Save, the
   `POST /api/kpi/.../weekly/batch` payload should contain exactly
   **one** row (for Week 8). Previously it contained 13.
7. After save, return to the listing — all weeks other than Week 8
   remain `—` instead of turning into `0`.
