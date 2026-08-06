# KPI Cumulative "1-per-week" Distribution — Plan

> **Status:** IMPLEMENTED (2026-07-08). Decisions confirmed: threshold = editable weeks (D1), auto-distribution only (D2), Number-only (D3), Teams owner rows included (D4). `isOnePerWeekCase` / `onePerWeekBreakdown` added to `kpiModalHelpers.ts` and wired into `buildBreakdown`, `buildOwnerBreakdown`, `redistributeFromCurrentWeek`. Typecheck clean; the 14 `__tests__/unit/kpiOnePerWeek.test.ts` cases pass.
> **Scope:** `apps/quikscale` — the shared KPI weekly-breakdown helpers, so the rule applies to **Individual KPI**, **Teams KPI**, and **OPSP → Your Accountability (Export to KPI)** at once.
> **Change type:** Code-only. No DB / schema / migration.

---

## 1. Requirement

When **Division Type = Cumulative** and the **target value ≤ the quarter's week count**, the weekly Target Breakdown should be distributed as **1 per week**, filled from the **last week backward**, with the earlier weeks left at 0.

**Example — target = 10, 13-week quarter:**

| Week | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Value | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Sum = 10 = target. The last 10 weeks (4–13) get 1; weeks 1–3 get 0.

### Why it's needed
Today, Cumulative + Number with a small target does `base = floor(target / weeks)` → for target 10 / 13 weeks, `base = 0` and Week 13 absorbs the whole 10 (`0,0,…,0,10`). That dumps the entire target into a single week. The new rule spreads a small integer target evenly as whole units across the tail of the quarter.

---

## 2. The rule (precise definition)

Let `firstEditableWeek` = first non-past week (past weeks are always 0), `lastEditableWeek = weekCount`, and `editableCount = weekCount − firstEditableWeek + 1`.

**Applies when ALL are true:**
- `divisionType === "Cumulative"`
- `measurementUnit === "Number"` (whole units only — Currency/Percentage keep the even split)
- `target` is a whole number
- `1 ≤ target ≤ editableCount`

**Distribution when it applies:**
```
map[w] = (w > lastEditableWeek − target) ? "1" : "0"
```
i.e. the last `target` editable weeks get `1`, everything before gets `0`.

- Because `target ≤ editableCount`, all the `1`s land in editable weeks — the past-week-is-0 invariant is preserved automatically (no `1` ever lands in a blocked week).
- Sum is exactly `target`, so `checkBreakdownBalance` stays green.

**Falls back to the current even-split logic when:**
- Division is Standalone, or
- unit ≠ Number, or
- target is not a whole number, or
- `target > editableCount` (more units than editable weeks — can't do clean 1-per-week without piling onto a week; keep existing `floor` + last-week-residue behaviour).

### Edge cases
| Case | Behaviour |
|---|---|
| target = weekCount (e.g. 13 / 13) | every week = 1 |
| target = 1 | only the last week = 1, rest 0 |
| Created mid-quarter (firstEditableWeek = 8, editableCount = 6), target = 10 | `10 > 6` → **fallback** even split (no 1s in past weeks) |
| Custom quarter (weekCount = 15), target = 12 | last 12 weeks = 1, first 3 = 0 |
| target = 10.5 (non-integer) | fallback even split |
| Currency / Percentage target 10 | fallback even split |

---

## 3. Where it goes (code)

All three surfaces already funnel through `apps/quikscale/app/(dashboard)/kpi/components/kpiModalHelpers.ts`:
- `buildBreakdown(...)` — initial distribution (Individual KPI modal, OPSP `exportHelpers.ts`, OPSP `ExportDrawer.tsx`).
- `buildOwnerBreakdown(...)` — per-owner rows (Teams KPI). Uses the owner's sub-target (`total × pct/100`); the rule applies only when that sub-target is itself a whole number ≤ editableCount (e.g. a single 100% owner), else fallback.
- `redistributeFromCurrentWeek(...)` — when the user edits the Target Value; applies the rule to the `remaining` amount over the editable tail.

Manual per-cell edits (`applyWeeklyEdit`) keep their current even redistribution — the rule governs only the **auto** distribution (initial + target-change). *(Decision D2 below.)*

### Shared helper (DRY, "like a pro")
Add two small pure functions and call them from the three builders:

```ts
/** True when the Cumulative "1 per week" distribution applies. */
export function isOnePerWeekCase(
  divisionType: DivisionType,
  unit: MeasurementUnit,
  target: number,
  editableCount: number,
): boolean {
  return (
    divisionType === "Cumulative" &&
    unit === "Number" &&
    Number.isInteger(target) &&
    target >= 1 &&
    target <= editableCount
  );
}

/** Last `target` editable weeks = "1", the rest = "0". `weeks` is 1..weekCount. */
export function onePerWeekBreakdown(
  weeks: number[],
  lastEditableWeek: number,
  target: number,
): WeeklyBreakdown {
  const map: WeeklyBreakdown = {};
  const threshold = lastEditableWeek - target; // weeks strictly above this get 1
  weeks.forEach((w) => { map[w] = w > threshold ? "1" : "0"; });
  return map;
}
```

Then, inside the `Number` + `Cumulative` branch of each builder, short-circuit:
```ts
if (isOnePerWeekCase(divisionType, unit, effectiveTarget, editableCount)) {
  return onePerWeekBreakdown(weeks, lastEditableWeek, effectiveTarget);
}
// …existing floor/residue split unchanged…
```
where `effectiveTarget` is `targetNum` in `buildBreakdown`, `ownerSubTarget` in `buildOwnerBreakdown`, and `remaining` in `redistributeFromCurrentWeek`.

### UI hint text (optional, recommended)
The "Target split equally across N weeks" caption in the KPI modal + OPSP export drawer becomes misleading. When the rule is active, show e.g. *"Target of 10 spread 1 per week across the last 10 weeks."* Purely cosmetic.

---

## 4. Files to change

| File | Change |
|---|---|
| `apps/quikscale/app/(dashboard)/kpi/components/kpiModalHelpers.ts` | Add `isOnePerWeekCase` + `onePerWeekBreakdown`; branch inside `buildBreakdown`, `buildOwnerBreakdown`, `redistributeFromCurrentWeek`. |
| `apps/quikscale/app/(dashboard)/kpi/components/KPIModal.tsx` | (Optional) conditional hint text. |
| `apps/quikscale/app/(dashboard)/opsp/components/ExportDrawer.tsx` | (Optional) conditional hint text. |
| `apps/quikscale/__tests__/unit/*` | New tests (below). No production behaviour change to existing paths. |

No changes to the API routes, DB, or Standalone/Currency/Percentage paths.

---

## 5. Tests

These cases live in `__tests__/unit/kpiOnePerWeek.test.ts` (all passing):
1. target 10 / 13 weeks → `[0,0,0,1,1,1,1,1,1,1,1,1,1]`, sum 10.
2. target 13 / 13 → all 1s; target 1 → only week 13 = 1.
3. target 12 / custom 15-week quarter → last 12 = 1, first 3 = 0.
4. `firstEditableWeek = 8`, target 10 (editableCount 6) → **fallback** (no 1s in weeks 1–7).
5. Non-integer (10.5) and non-Number (Currency/Percentage) → fallback (unchanged).
6. `buildOwnerBreakdown`: single 100% owner, target 10 → 1-per-week; fractional sub-target → fallback.
7. `redistributeFromCurrentWeek`: target set to 8, all weeks editable → last 8 weeks = 1.
8. Regression: target 130 / 13 weeks (> weekCount) still uses the old even split (10 each).

---

## 6. Decisions (all confirmed)

- **D1 — Threshold = editable weeks (recommended) or literal week count?** Recommended: `target ≤ editableCount`. For a fresh quarter (all weeks editable) this equals the week count exactly (your example). It only differs when a KPI is created mid-quarter, where using editable weeks keeps `1`s out of blocked past weeks.
- **D2 — Auto-distribution only (recommended), or also manual cell edits?** Recommended: apply to the auto builders only; leave manual `applyWeeklyEdit` redistribution as the current even split.
- **D3 — Number unit only (recommended)?** Recommended: yes. Currency/Percentage keep the even split (1-per-week is a whole-unit concept).
- **D4 — Teams owner rows:** apply per-owner when the owner sub-target is a whole number ≤ editableCount (recommended yes).
