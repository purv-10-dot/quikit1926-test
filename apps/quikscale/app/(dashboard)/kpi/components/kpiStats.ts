/**
 * Pure stats computation for a KPI row — extracted from LogModal in R6.
 *
 * Given a `KPIRow` with `weeklyValues`, returns:
 *   - `filledWeeks`  — weeks that have a non-null, non-undefined value
 *   - `avgPerWeek`   — average of filled weeks' values
 *   - `bestWeek`     — week number with the highest value (0 if none)
 *   - `bestValue`    — the achieved value at `bestWeek` (0 if none)
 *
 * Split out so the math can be unit-tested independently of React.
 */

import type { KPIRow, WeeklyValue } from "@/lib/types/kpi";
import { ALL_WEEKS } from "@/lib/utils/fiscal";

export interface KPIStats {
  filledWeeks: number[];
  avgPerWeek: number;
  bestWeek: number;
  bestValue: number;
}

export function computeKPIStats(kpi: KPIRow): KPIStats {
  const weekMap: Record<number, WeeklyValue> = {};
  (kpi.weeklyValues ?? []).forEach((w) => {
    weekMap[w.weekNumber] = w;
  });

  const filledWeeks = ALL_WEEKS.filter(
    (w) => weekMap[w]?.value !== null && weekMap[w]?.value !== undefined,
  );
  const avgPerWeek =
    filledWeeks.length > 0
      ? filledWeeks.reduce((s, w) => s + (weekMap[w]?.value ?? 0), 0) /
        filledWeeks.length
      : 0;
  const bestWeek = filledWeeks.reduce<number>((best, w) => {
    const v = weekMap[w]?.value ?? 0;
    return v > (weekMap[best]?.value ?? 0) ? w : best;
  }, filledWeeks[0] ?? 0);
  const bestValue = bestWeek > 0 ? (weekMap[bestWeek]?.value ?? 0) : 0;

  return { filledWeeks, avgPerWeek, bestWeek, bestValue };
}

/**
 * QTD Goal + QTD Achieved over weeks [1 .. currentWeek-1].
 *
 * Behavior depends on `divisionType` (defaults to `"Cumulative"` when omitted
 * or unset on the KPI — matches the schema default):
 *
 *   ┌──────────────┬────────────────────────────┬────────────────────────────┐
 *   │              │ Cumulative                 │ Standalone                 │
 *   ├──────────────┼────────────────────────────┼────────────────────────────┤
 *   │ qtdGoal      │ Σ weekly targets so far    │ = kpi.target (constant,    │
 *   │              │ (per-week map; falls back  │   when at least one prior  │
 *   │              │  to target/13 flat split)  │   week has target > 0)     │
 *   │ qtdAchieved  │ Σ values so far            │ Σ values so far /          │
 *   │              │                            │   count(weeks with target  │
 *   │              │                            │   > 0 in [1..currentWeek-1])│
 *   └──────────────┴────────────────────────────┴────────────────────────────┘
 *
 * Standalone matches the spec in `docs/individualKpi-standalone-logic.md`:
 * the denominator is `weeksWithTarget.length` (NOT the count of updated
 * weeks), so a week with a target but no entered value drags the average
 * down — the documented "penalty" semantics.
 *
 * When `currentWeek` is null (quarter not started / already ended / unknown)
 * we fall back to the server-stored `kpi.qtdGoal` / `qtdAchieved` to keep
 * historical/future KPIs rendering something sensible.
 *
 * Same algorithm StatsTab uses — extracted so the dashboard KPI table can
 * show the same numbers (was previously reading `kpi.qtdGoal` raw, which is
 * a stale aggregate that ignores the per-week breakdown).
 */
export function computeQtd(
  kpi: KPIRow,
  currentWeek: number | null,
  divisionType: "Cumulative" | "Standalone" = "Cumulative",
): {
  qtdGoal: number | null;
  qtdAchieved: number | null;
} {
  if (currentWeek == null) {
    return {
      qtdGoal: kpi.target ?? kpi.qtdGoal ?? null,
      qtdAchieved: kpi.qtdAchieved ?? null,
    };
  }
  if (currentWeek <= 1) {
    return { qtdGoal: 0, qtdAchieved: 0 };
  }

  const priorWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);
  const wt = kpi.weeklyTargets ?? {};
  const totalTarget = kpi.target ?? kpi.qtdGoal ?? 0;
  const flat = totalTarget > 0 ? totalTarget / 13 : 0;

  // Resolve each prior week's target (per-week map → fallback to flat split).
  const priorWeekTargets = priorWeeks.map((w) => {
    const v = wt[String(w)];
    return typeof v === "number" ? v : flat;
  });

  const wv = kpi.weeklyValues ?? [];
  const priorWeekValues = wv.filter((v) => v.weekNumber < currentWeek);
  const sumOfValues = priorWeekValues.reduce((sum, v) => sum + (v.value ?? 0), 0);

  if (divisionType === "Standalone") {
    // Standalone — every "valid" week (target > 0) counts equally toward
    // the denominator; the goal is the quarterly target (not a running sum).
    const weeksWithTargetCount = priorWeekTargets.filter((t) => t > 0).length;
    if (weeksWithTargetCount === 0) {
      return { qtdGoal: 0, qtdAchieved: 0 };
    }
    return {
      qtdGoal: totalTarget,
      qtdAchieved: sumOfValues / weeksWithTargetCount,
    };
  }

  // Cumulative — preserved exactly as before.
  const goal = priorWeekTargets.reduce((s, t) => s + t, 0);
  return { qtdGoal: goal, qtdAchieved: sumOfValues };
}

/**
 * Weekly Goal for a specific week. Uses the saved per-week target when set,
 * otherwise falls back to the flat 1/13 split of the quarterly target.
 */
export function weeklyGoalFor(kpi: KPIRow, weekNumber: number): number {
  const wt = kpi.weeklyTargets ?? {};
  const raw = wt[String(weekNumber)];
  if (typeof raw === "number") return raw;
  const total = kpi.target ?? kpi.qtdGoal ?? 0;
  return total > 0 ? total / 13 : 0;
}
