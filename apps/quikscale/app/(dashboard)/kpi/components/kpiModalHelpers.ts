/**
 * Pure helper functions for KPIModal — extracted in R6.
 *
 * KPIModal (1090 lines) is the most complex component in QuikScale. It
 * juggles target cascades, per-owner contribution splits, cumulative vs
 * standalone division, and currency scale conversion. Before decomposing
 * the component itself, this file extracts every *pure* formula so they
 * can be unit-tested in isolation and shared with LogModal if needed.
 *
 * Invariants guaranteed by this file:
 *   - `buildBreakdown(div, target, unit)` returns exactly 13 weekly cells
 *   - `sum(cells) === target` (or within floating-point tolerance)
 *   - `buildOwnerBreakdown(pct, target, div, unit)` returns 13 cells that
 *     sum to `target * (pct / 100)`
 *   - `redistributeOwnerRemainder` preserves cells 1..fromWeek exactly
 *   - Blocked (past) weeks always receive "0" — target is distributed
 *     only across editable weeks when `firstEditableWeek > 1`
 */

import { weeksArray, DEFAULT_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";

export type DivisionType = "Cumulative" | "Standalone";
export type MeasurementUnit = string; // "Number" | "Percentage" | "Currency"
export type WeeklyBreakdown = Record<number, string>;

/**
 * Format a single weekly breakdown value for display.
 * - Number unit: rounded to nearest integer
 * - All other units: 2 decimal places
 */
export function fmtBreakdown(
  val: number,
  measurementUnit: MeasurementUnit,
): string {
  if (measurementUnit === "Number") return String(Math.round(val));
  return val.toFixed(2);
}

/**
 * True when the Cumulative "1 per week" distribution applies: a whole-number
 * Number-unit target that fits within the editable weeks. See
 * docs/kpi-cumulative-one-per-week.md.
 */
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

/**
 * Distribute `target` as 1 per week across the LAST `target` editable weeks,
 * everything before gets "0". `weeks` is 1..weekCount, `lastEditableWeek` is
 * the highest editable week. Callers must gate on {@link isOnePerWeekCase}
 * (which guarantees `target <= editableCount`, so no `1` lands in a past week).
 */
export function onePerWeekBreakdown(
  weeks: number[],
  lastEditableWeek: number,
  target: number,
): WeeklyBreakdown {
  const map: WeeklyBreakdown = {};
  const threshold = lastEditableWeek - target; // weeks strictly above this get 1
  weeks.forEach((w) => {
    map[w] = w > threshold ? "1" : "0";
  });
  return map;
}

/**
 * Compute a 13-week breakdown for a KPI target.
 *
 * - **Standalone**: every week = `target` (full target each week)
 * - **Cumulative + Number**: every editable week shows `floor(target/N)`;
 *   Week 13 absorbs the entire flooring residue so the sum matches the target
 * - **Cumulative + other**: equal 2-decimal split across editable weeks with
 *   the last editable week absorbing the rounding residue
 *
 * @param firstEditableWeek Weeks before this are blocked (past) and get "0".
 *   Defaults to 1 (all weeks editable). Standalone mode ignores this — all
 *   weeks get the full target since they're independent.
 *
 * Returns an empty-string map when `target <= 0` (so form fields stay
 * placeholder-visible).
 */
export function buildBreakdown(
  divisionType: DivisionType,
  targetNum: number,
  measurementUnit: MeasurementUnit,
  firstEditableWeek: number = 1,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): WeeklyBreakdown {
  const weeks = weeksArray(weeksPerQuarter);
  const map: WeeklyBreakdown = {};
  if (targetNum <= 0) {
    weeks.forEach((w) => {
      map[w] = "";
    });
    return map;
  }

  // Standalone: each week independently carries the full target.
  // Past weeks default to 0 (you can't plan a target retroactively); the
  // user can flip a past week to `target` later when the past-week toggle
  // is enabled. Current..last hold the full target.
  if (divisionType === "Standalone") {
    const targetVal = fmtBreakdown(targetNum, measurementUnit);
    const zeroVal = measurementUnit === "Number" ? "0" : "0.00";
    weeks.forEach((w) => {
      map[w] = w < firstEditableWeek ? zeroVal : targetVal;
    });
    return map;
  }

  // Cumulative: distribute only across editable weeks
  const editableCount = Math.max(1, weeksPerQuarter + 1 - firstEditableWeek);
  const lastEditableWeek = weeksPerQuarter;

  // Cumulative + Number, whole target within the editable weeks: spread 1 per
  // week across the tail instead of dumping the flooring residue on Week 13.
  if (isOnePerWeekCase(divisionType, measurementUnit, targetNum, editableCount)) {
    return onePerWeekBreakdown(weeks, lastEditableWeek, targetNum);
  }

  if (measurementUnit === "Number") {
    const base = Math.floor(targetNum / editableCount);
    // Last week absorbs the entire flooring residue (target - base * (editableCount-1)).
    weeks.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0";
      } else if (w === lastEditableWeek) {
        map[w] = String(Math.round(targetNum - base * (editableCount - 1)));
      } else {
        map[w] = String(base);
      }
    });
  } else {
    const base = parseFloat((targetNum / editableCount).toFixed(2));
    const diff = parseFloat((targetNum - base * editableCount).toFixed(2));
    weeks.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0.00";
      } else {
        map[w] = base.toFixed(2);
      }
    });
    // Last editable week absorbs rounding residue
    map[lastEditableWeek] = (base + diff).toFixed(2);
  }
  return map;
}

/**
 * Apply a manual edit to one weekly Target-Breakdown cell and, for Cumulative,
 * auto-redistribute the remaining target across the LATER weeks. Single source
 * of truth shared by the Individual KPI modal (`setWeekBreakdown`) and the OPSP
 * "Export → Create KPIs" drawer, so both behave identically.
 *
 *   - Clamp the typed value to `[0, target − sum(weeks before `week`)]` when
 *     `clampToTarget` (default). Pass `false` to keep an over-target entry as
 *     typed so the form can WARN the user (the KPI Add/Edit modals do this);
 *     the OPSP export drawer keeps the default clamp.
 *   - Format: whole for "Number", 2-decimal otherwise.
 *   - Cumulative: spread `target − sum(weeks 1..week)` evenly across
 *     `week+1..13`, Week 13 absorbing the rounding residue.
 *   - Standalone: set the one cell, no redistribution.
 *
 * `target` is the resolved numeric target (callers apply any currency scale
 * before passing it in). Pure — no React — so the maths is unit-testable.
 */
export function applyWeeklyEdit(
  weekly: WeeklyBreakdown,
  week: number,
  rawVal: string,
  target: number,
  measurementUnit: MeasurementUnit,
  divisionType: DivisionType,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
  clampToTarget: boolean = true,
): WeeklyBreakdown {
  const isWhole = measurementUnit === "Number";
  const lastWeek = weeksPerQuarter;

  let priorSum = 0;
  for (let i = 1; i < week; i++) priorSum += parseFloat(String(weekly[i])) || 0;
  const maxAllowed = Math.max(0, target - priorSum);

  let parsed = parseFloat(rawVal);
  if (rawVal === "" || isNaN(parsed)) parsed = 0;
  if (parsed < 0) parsed = 0;
  if (divisionType === "Cumulative" && clampToTarget && parsed > maxAllowed) parsed = maxAllowed;

  const val = rawVal === "" ? "" : isWhole ? String(Math.round(parsed)) : parsed.toFixed(2);
  const next: WeeklyBreakdown = { ...weekly, [week]: val };
  if (divisionType !== "Cumulative") return next;

  let leftSum = 0;
  for (let i = 1; i <= week; i++) leftSum += parseFloat(String(next[i])) || 0;

  const remaining = Math.max(0, target - leftSum);
  const rightCount = lastWeek - week;
  if (rightCount <= 0) return next;

  if (isWhole) {
    const base = Math.floor(remaining / rightCount);
    for (let i = week + 1; i <= lastWeek; i++) {
      next[i] = String(i === lastWeek ? Math.round(remaining - base * (rightCount - 1)) : base);
    }
  } else {
    const base = parseFloat((remaining / rightCount).toFixed(2));
    const diff = parseFloat((remaining - base * rightCount).toFixed(2));
    for (let i = week + 1; i <= lastWeek; i++) next[i] = base.toFixed(2);
    next[lastWeek] = (base + diff).toFixed(2);
  }
  return next;
}

/**
 * Compute the 13-week breakdown for a single owner given their
 * contribution percentage. The owner's sub-target is
 * `totalTarget * (ownerContributionPct / 100)`.
 *
 * @param firstEditableWeek Weeks before this are blocked and get "0".
 *   Defaults to 1 (all weeks editable).
 *
 * Returns an empty-string map when the owner sub-target is <= 0.
 */
export function buildOwnerBreakdown(
  ownerContributionPct: number,
  totalTarget: number,
  division: DivisionType,
  unit: MeasurementUnit,
  firstEditableWeek: number = 1,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): WeeklyBreakdown {
  const weeks = weeksArray(weeksPerQuarter);
  const ownerSubTarget = totalTarget * (ownerContributionPct / 100);
  if (ownerSubTarget <= 0) {
    return Object.fromEntries(weeks.map((w) => [w, ""])) as WeeklyBreakdown;
  }

  // Standalone: each week independently = full owner sub-target.
  // Past weeks default to 0; user can flip them to sub-target when the
  // past-week toggle is enabled. Current..last hold the full sub-target.
  if (division === "Standalone") {
    const targetVal =
      unit === "Number"
        ? String(Math.round(ownerSubTarget))
        : ownerSubTarget.toFixed(2);
    const zeroVal = unit === "Number" ? "0" : "0.00";
    return Object.fromEntries(
      weeks.map((w) => [w, w < firstEditableWeek ? zeroVal : targetVal]),
    ) as WeeklyBreakdown;
  }

  // Cumulative: distribute only across editable weeks
  const editableCount = Math.max(1, weeksPerQuarter + 1 - firstEditableWeek);
  const lastEditableWeek = weeksPerQuarter;
  const map: WeeklyBreakdown = {};

  // 1-per-week applies only when the owner's sub-target is itself a whole
  // number within the editable weeks (e.g. a single 100% owner).
  if (isOnePerWeekCase(division, unit, ownerSubTarget, editableCount)) {
    return onePerWeekBreakdown(weeks, lastEditableWeek, ownerSubTarget);
  }

  if (unit === "Number") {
    const base = Math.floor(ownerSubTarget / editableCount);
    // Last week absorbs all flooring residue.
    weeks.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0";
      } else if (w === lastEditableWeek) {
        map[w] = String(Math.round(ownerSubTarget - base * (editableCount - 1)));
      } else {
        map[w] = String(base);
      }
    });
  } else {
    const base = parseFloat((ownerSubTarget / editableCount).toFixed(2));
    const diff = parseFloat((ownerSubTarget - base * editableCount).toFixed(2));
    weeks.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0.00";
      } else {
        map[w] = base.toFixed(2);
      }
    });
    map[lastEditableWeek] = (base + diff).toFixed(2);
  }
  return map;
}

/**
 * Redistribute `remaining = subTarget - sum(cells 1..fromWeek)` evenly
 * across cells (fromWeek+1) .. 13, leaving the left side untouched.
 *
 * Used when a user manually edits week N in an owner row — the UI
 * re-balances weeks N+1..13 so the row still sums to the owner sub-target.
 *
 * Preserves integer arithmetic for Number unit (base + extra piled on
 * rightmost weeks). For other units: 2-decimal split with residue on W13.
 */
export function redistributeOwnerRemainder(
  ownerRow: WeeklyBreakdown,
  fromWeek: number,
  ownerSubTarget: number,
  unit: MeasurementUnit,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): WeeklyBreakdown {
  const lastWeek = weeksPerQuarter;
  const row = { ...ownerRow };
  let leftSum = 0;
  for (let i = 1; i <= fromWeek; i++) leftSum += parseFloat(String(row[i])) || 0;

  const remaining = Math.max(0, ownerSubTarget - leftSum);
  const rightCount = lastWeek - fromWeek;
  if (rightCount <= 0) return row;

  if (unit === "Number") {
    // Number unit: each subsequent week gets floor(remaining/rightCount);
    // the last week absorbs the entire flooring residue.
    const base = Math.floor(remaining / rightCount);
    for (let i = fromWeek + 1; i <= lastWeek; i++) {
      row[i] = String(i === lastWeek ? Math.round(remaining - base * (rightCount - 1)) : base);
    }
  } else {
    const base = parseFloat((remaining / rightCount).toFixed(2));
    const diff = parseFloat((remaining - base * rightCount).toFixed(2));
    for (let i = fromWeek + 1; i <= lastWeek; i++) row[i] = base.toFixed(2);
    row[lastWeek] = (base + diff).toFixed(2);
  }
  return row;
}

/**
 * Rebuild a weekly breakdown when the row's target changes (e.g. user edits
 * the Target Value field). PRESERVES the past-week cells exactly — only
 * redistributes the *remaining* target across `[firstEditableWeek..13]`.
 *
 *   remaining = max(0, target - sum(cells 1..firstEditableWeek-1))
 *   Number   → each editable week = floor(remaining/N); Week 13 absorbs residue
 *   Other    → 2-decimal even split; Week 13 absorbs rounding residue
 *
 * Standalone mode is reset (every week = full target) since the per-week
 * value is independent of past data — semantic shift, not a redistribution.
 *
 * Called by KPIModal's `setTarget` (and the analogous owner-row recompute in
 * team scope) so past-week edits the user already made are not erased when
 * they tweak the total.
 */
export function redistributeFromCurrentWeek(
  current: WeeklyBreakdown,
  targetNum: number,
  divisionType: DivisionType,
  unit: MeasurementUnit,
  firstEditableWeek: number = 1,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): WeeklyBreakdown {
  const weeks = weeksArray(weeksPerQuarter);
  if (targetNum <= 0) {
    return Object.fromEntries(weeks.map((w) => [w, ""])) as WeeklyBreakdown;
  }

  if (divisionType === "Standalone") {
    const targetVal =
      unit === "Number" ? String(Math.round(targetNum)) : targetNum.toFixed(2);
    const zeroVal = unit === "Number" ? "0" : "0.00";
    return Object.fromEntries(
      weeks.map((w) => [w, w < firstEditableWeek ? zeroVal : targetVal]),
    ) as WeeklyBreakdown;
  }

  // Preserve past cells exactly (carrying over whatever the user/DB left there).
  const out: WeeklyBreakdown = {};
  for (let w = 1; w < firstEditableWeek; w++) {
    const v = current[w];
    out[w] = v != null && v !== "" ? v : (unit === "Number" ? "0" : "0.00");
  }

  let pastSum = 0;
  for (let w = 1; w < firstEditableWeek; w++) {
    pastSum += parseFloat(String(out[w])) || 0;
  }
  const remaining = Math.max(0, targetNum - pastSum);
  const editableCount = Math.max(1, weeksPerQuarter + 1 - firstEditableWeek);
  const lastEditableWeek = weeksPerQuarter;

  // 1-per-week on the remaining amount over the editable tail. Past cells in
  // `out` are already preserved above, so we only touch editable weeks here.
  if (isOnePerWeekCase(divisionType, unit, remaining, editableCount)) {
    const threshold = lastEditableWeek - remaining; // weeks above this get 1
    for (let w = firstEditableWeek; w <= lastEditableWeek; w++) {
      out[w] = w > threshold ? "1" : "0";
    }
    return out;
  }

  if (unit === "Number") {
    const base = Math.floor(remaining / editableCount);
    for (let w = firstEditableWeek; w <= lastEditableWeek; w++) {
      out[w] = String(
        w === lastEditableWeek
          ? Math.round(remaining - base * (editableCount - 1))
          : base,
      );
    }
  } else {
    const base = parseFloat((remaining / editableCount).toFixed(2));
    const diff = parseFloat((remaining - base * editableCount).toFixed(2));
    for (let w = firstEditableWeek; w <= lastEditableWeek; w++) out[w] = base.toFixed(2);
    out[lastEditableWeek] = (base + diff).toFixed(2);
  }
  return out;
}

/**
 * Sum a weekly breakdown's cells as numbers. Non-numeric cells count as 0.
 * Exposed for tests + potential UI "total" displays.
 */
export function sumBreakdown(row: WeeklyBreakdown): number {
  return Object.values(row).reduce<number>((acc, v) => {
    const n = parseFloat(String(v));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export interface BreakdownBalance {
  /** Total of the weekly cells (raw). */
  sum: number;
  /** The KPI target (raw). */
  target: number;
  /** target − sum: positive = under-allocated, negative = over-allocated. */
  remaining: number;
  /** "balanced" within tolerance, else "under" / "over". */
  status: "balanced" | "under" | "over";
}

/**
 * Check whether a Cumulative weekly breakdown adds up to the target.
 *
 * The sum of the weekly cells MUST equal the target value — the last-week-only
 * editable case (past weeks locked) lets a user leave a shortfall the
 * redistribution can't absorb, so the form surfaces the `remaining` amount and
 * blocks submit until it's 0.
 *
 * `tolerance` (default 0.01) absorbs 2-decimal currency rounding residue.
 * A non-positive `target` is treated as "balanced" (nothing to enforce yet).
 * Standalone KPIs must NOT use this — each week carries the full target, so the
 * sum is intentionally target × weeks.
 */
export function checkBreakdownBalance(
  sum: number,
  target: number,
  tolerance = 0.01,
): BreakdownBalance {
  const remaining = target - sum;
  let status: BreakdownBalance["status"] = "balanced";
  if (target > 0) {
    if (remaining > tolerance) status = "under";
    else if (remaining < -tolerance) status = "over";
  }
  return { sum, target, remaining, status };
}

/**
 * Evenly distribute 100% contribution across N owners, using 2-decimal
 * precision with the last owner absorbing the rounding residue.
 *
 * Returns a string-valued map (matches the form-state shape).
 */
export function distributeContributionsEven(
  ownerIds: string[],
): Record<string, string> {
  if (ownerIds.length === 0) return {};
  const base = Math.floor((100 / ownerIds.length) * 100) / 100;
  const last = parseFloat((100 - base * (ownerIds.length - 1)).toFixed(2));
  const out: Record<string, string> = {};
  ownerIds.forEach((id, i) => {
    out[id] = (i === ownerIds.length - 1 ? last : base).toString();
  });
  return out;
}
