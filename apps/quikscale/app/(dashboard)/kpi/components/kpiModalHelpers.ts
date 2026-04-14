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

import { ALL_WEEKS } from "@/lib/utils/fiscal";

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
 * Compute a 13-week breakdown for a KPI target.
 *
 * - **Standalone**: every week = `target` (full target each week)
 * - **Cumulative + Number**: floor-divide across editable weeks, pile
 *   `remainder` onto the last `remainder` editable weeks so the sum matches
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
): WeeklyBreakdown {
  const map: WeeklyBreakdown = {};
  if (targetNum <= 0) {
    ALL_WEEKS.forEach((w) => {
      map[w] = "";
    });
    return map;
  }

  // Standalone: every week = full target (independent of blocking)
  if (divisionType === "Standalone") {
    const val = fmtBreakdown(targetNum, measurementUnit);
    ALL_WEEKS.forEach((w) => {
      map[w] = val;
    });
    return map;
  }

  // Cumulative: distribute only across editable weeks
  const editableCount = Math.max(1, 14 - firstEditableWeek); // weeks from firstEditableWeek..13
  const lastEditableWeek = 13;

  if (measurementUnit === "Number") {
    const base = Math.floor(targetNum / editableCount);
    const extra = Math.round(targetNum - base * editableCount);
    ALL_WEEKS.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0";
      } else {
        // Pile extra onto the last `extra` editable weeks
        const posFromEnd = lastEditableWeek - w; // 0 for week 13, 1 for week 12, etc.
        map[w] = String(posFromEnd < extra ? base + 1 : base);
      }
    });
  } else {
    const base = parseFloat((targetNum / editableCount).toFixed(2));
    const diff = parseFloat((targetNum - base * editableCount).toFixed(2));
    ALL_WEEKS.forEach((w) => {
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
): WeeklyBreakdown {
  const ownerSubTarget = totalTarget * (ownerContributionPct / 100);
  if (ownerSubTarget <= 0) {
    return Object.fromEntries(ALL_WEEKS.map((w) => [w, ""])) as WeeklyBreakdown;
  }

  // Standalone: every week = full sub-target (independent of blocking)
  if (division === "Standalone") {
    const val =
      unit === "Number"
        ? String(Math.round(ownerSubTarget))
        : ownerSubTarget.toFixed(2);
    return Object.fromEntries(
      ALL_WEEKS.map((w) => [w, val]),
    ) as WeeklyBreakdown;
  }

  // Cumulative: distribute only across editable weeks
  const editableCount = Math.max(1, 14 - firstEditableWeek);
  const lastEditableWeek = 13;
  const map: WeeklyBreakdown = {};

  if (unit === "Number") {
    const base = Math.floor(ownerSubTarget / editableCount);
    const extra = Math.round(ownerSubTarget - base * editableCount);
    ALL_WEEKS.forEach((w) => {
      if (w < firstEditableWeek) {
        map[w] = "0";
      } else {
        const posFromEnd = lastEditableWeek - w;
        map[w] = String(posFromEnd < extra ? base + 1 : base);
      }
    });
  } else {
    const base = parseFloat((ownerSubTarget / editableCount).toFixed(2));
    const diff = parseFloat((ownerSubTarget - base * editableCount).toFixed(2));
    ALL_WEEKS.forEach((w) => {
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
): WeeklyBreakdown {
  const row = { ...ownerRow };
  let leftSum = 0;
  for (let i = 1; i <= fromWeek; i++) leftSum += parseFloat(String(row[i])) || 0;

  const remaining = Math.max(0, ownerSubTarget - leftSum);
  const rightCount = 13 - fromWeek;
  if (rightCount <= 0) return row;

  if (unit === "Number") {
    const base = Math.floor(remaining / rightCount);
    const extra = Math.round(remaining - base * rightCount);
    for (let i = fromWeek + 1; i <= 13; i++) {
      row[i] = String(13 - i < extra ? base + 1 : base);
    }
  } else {
    const base = parseFloat((remaining / rightCount).toFixed(2));
    const diff = parseFloat((remaining - base * rightCount).toFixed(2));
    for (let i = fromWeek + 1; i <= 13; i++) row[i] = base.toFixed(2);
    row[13] = (base + diff).toFixed(2);
  }
  return row;
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
