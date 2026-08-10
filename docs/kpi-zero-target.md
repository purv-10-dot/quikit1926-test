# KPI Target Value of 0 (Individual + Team)

## Summary

Both **Individual KPI** and **Team KPI** now accept a **Target Value of `0`**.

Previously the Add/Edit KPI modal rejected `0` with *"Please enter a target
value greater than 0."* and the API schema used `z.number().positive()`. A
target of `0` is a legitimate goal — the canonical case is a **"zero defects"
KPI** (reverse color coding, where any positive actual is a miss and only `0`
meets the target).

### Validation rules after this change

| Target input | Individual | Team | Result |
|---|---|---|---|
| `0` | ✅ | ✅ | Accepted |
| Positive number | ✅ | ✅ | Accepted (unchanged) |
| Negative | ❌ | ❌ | Rejected — *"Please enter a target value of 0 or greater."* |
| Empty / non-numeric | ❌ | ❌ | Rejected (target is still required) |

## What changed

Only the two **validation gates** were touched — the breakdown and
calculation stack already handled `target = 0` defensively.

1. **Frontend** — [`apps/quikscale/app/(dashboard)/kpi/components/KPIModal.tsx`](../apps/quikscale/app/(dashboard)/kpi/components/KPIModal.tsx)
   `validate()`: `targetNum <= 0` → `targetNum < 0`, with an updated message.
   Shared by Individual and Team KPI (one modal).

2. **Backend** — [`apps/quikscale/lib/schemas/kpiSchema.ts`](../apps/quikscale/lib/schemas/kpiSchema.ts)
   `target`, `quarterlyGoal`, `qtdGoal` changed from `z.number().positive()`
   to `z.number().nonnegative()` in **both** `createKPISchema` and
   `updateKPISchema`. Team-KPI child creation derives
   `childTarget = target * pct / 100 = 0` and flows through unchanged.

## Weekly breakdown & tracking for a zero target (phase 2)

The first phase only unblocked the value. A follow-up makes a zero-target KPI
**fully usable** — the breakdown shows `0` in every week and the Updates tab is
trackable instead of showing "No target set for this week."

| Area | File | Behavior at whole-KPI `target = 0` |
|---|---|---|
| Weekly breakdown build | `kpiModalHelpers.buildBreakdown` / `buildOwnerBreakdown` | Every week = `"0"` / `"0.00"` (was empty). Negative target still ⇒ empty. |
| Breakdown grid visibility | `KPIModal.tsx` | Grid shows when a valid **non-negative** target is entered (incl. `0`); stays hidden while the field is empty. |
| Updates tab — lock | `LogModal.tsx` | A **zero-target KPI** keeps its weeks editable (respecting the normal past-week lock) instead of locking them as "No target set". A `0` on a *single* week inside a *positive* KPI still locks — unchanged. |
| Updates tab — target display | `LogModal.tsx` | Shows `0` (individual + team) instead of `—`. |
| Stats — Weekly Goal | `StatsTab.tsx` | Shows `0` instead of `—` for a zero-target KPI. |

`isZeroTargetKPI` is decided by the **KPI-level** target (`liveFormTarget ?? qtdGoal ?? target === 0`), never by a single week's value — so it never changes how a positive KPI treats an individual 0-target week.

## Edit form restoring a saved 0 (phase 3)

**Bug:** after creating a zero-target KPI, re-opening it to **edit** showed a
blank Target Value and no weekly breakdown. Both edit surfaces initialised the
target field with a `displayTarget > 0 ? String(displayTarget) : ""` check, so a
saved `0` (which fails `> 0`) loaded as an empty string — and the empty field
then hid the breakdown grid.

| Fix | File | Change |
|---|---|---|
| KPIModal edit init | `KPIModal.tsx` | `target: kpi?.target != null ? String(displayTarget) : ""` — restore a saved `0`; only a fresh create / genuinely unset target starts blank. |
| Log/Edit-modal init | `LogModal.tsx` | Same `kpi.target != null` guard on the Edit-tab `editForm.target`. |
| Edit-tab grid visibility | `LogModal.tsx` | Grid gate changed from `targetNum > 0` to the shared `showBreakdown` rule (valid non-negative target, incl. `0`). |

The stored `weeklyTargets` were already all `0`, so once the field restores to
`0` the grid renders the `0` cells in both edit surfaces (Individual + Team,
KPIModal side panel + LogModal Edit tab).

## The calculation stack was already zero-safe

No math changed — `target = 0` computes correctly everywhere:

| Concern | Location | Behavior at `target = 0` |
|---|---|---|
| Cumulative balance check | `kpiModalHelpers.checkBreakdownBalance` | Non-positive target ⇒ `balanced` (submit not blocked); all-zero cells sum to `0` |
| Even-split math | `breakdownCalc.calculateBreakdown` | Distributes zeros |
| Cell color (forward) | `colorLogic.resolveColorByPercentage` | `value > 0` ⇒ BLUE (exceeded), else NEUTRAL/RED |
| Cell color (reverse) | `colorLogic.resolveReversedColorByPercentage` | `value === 0` ⇒ BLUE, `value > 0` ⇒ RED (zero-tolerance) |
| Percentage / progress | `colorLogic`, `kpiStats`, `kpiHelpers`, weekly routes | All guard `target/goal > 0 ? … : 0` |

## Tests

- `__tests__/unit/kpiSchema.test.ts` — target `0` accepted (Individual + Team, create + update); negative rejected.
- `__tests__/unit/kpiModalHelpers.test.ts` — `buildBreakdown`/`buildOwnerBreakdown` target `0` ⇒ all-zero cells (`"0"`/`"0.00"`) that sum to `0`; negative ⇒ empty; `checkBreakdownBalance` target `0` ⇒ balanced.
- `__tests__/unit/colorLogic.test.ts` — target-`0` forward/reverse/zero-tolerance buckets (pre-existing regression guards).
- `__tests__/api/kpi.post.test.ts` — POST Individual and Team KPI with `target: 0` ⇒ 201; children derive `target: 0`.
- `__tests__/components/KPIModal.dom.test.tsx` — entering `0` submits and shows a breakdown grid with `0` in every week; empty field hides the grid; `-5`/empty are blocked with the error message.
- `__tests__/components/LogModal.dom.test.tsx` — a zero-target KPI keeps weeks editable, shows `0` targets, and never renders "No target set"; a 0-target week inside a positive KPI still locks (regression guard); **Edit tab restores a saved `0` in the field + breakdown grid**.
- `__tests__/components/StatsTab.dom.test.tsx` — Weekly Goal shows a `0` target (not `—`) for a zero-target KPI.
- **Edit-mode regressions** (phase 3): `KPIModal.dom` + `LogModal.dom` assert that re-opening a saved `target: 0` KPI shows `"0"` in the field and `0` in every breakdown cell.

## Scope / non-goals

No change to the 4 locked tables, theming, OPSP, Performance goals, or any
other module. The change is limited to KPI target handling (validation +
breakdown/tracking display + edit-form restoration).
