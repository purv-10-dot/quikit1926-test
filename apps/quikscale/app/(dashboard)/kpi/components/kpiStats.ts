/**
 * Pure stats computation for a KPI row — extracted from LogModal in R6.
 *
 * Given a `KPIRow` with `weeklyValues`, returns:
 *   - `filledWeeks`  — weeks that have a non-null, non-undefined value
 *   - `avgPerWeek`   — average of filled weeks' values
 *   - `bestWeek`     — week number with the highest value (0 if none)
 *
 * Split out so the math can be unit-tested independently of React.
 */

import type { KPIRow, WeeklyValue } from "@/lib/types/kpi";
import { ALL_WEEKS } from "@/lib/utils/fiscal";

export interface KPIStats {
  filledWeeks: number[];
  avgPerWeek: number;
  bestWeek: number;
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

  return { filledWeeks, avgPerWeek, bestWeek };
}

/**
 * QTD Goal + QTD Achieved over weeks [1 .. currentWeek-1].
 *
 *   - Uses `kpi.weeklyTargets` per-week goal map when present; falls back to
 *     an even split of the total target across 13 weeks when no breakdown.
 *   - Uses `kpi.weeklyValues` actuals filtered to weeks < currentWeek.
 *
 * When `currentWeek` is null (quarter not started / already ended / unknown)
 * we fall back to the server-stored `kpi.qtdGoal` / `qtdAchieved`.
 *
 * Same algorithm StatsTab uses — extracted so the dashboard KPI table can
 * show the same numbers (was previously reading `kpi.qtdGoal` raw, which is
 * a stale aggregate that ignores the per-week breakdown).
 */
export function computeQtd(kpi: KPIRow, currentWeek: number | null): {
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
  const goal = priorWeeks.reduce((sum, w) => {
    const v = wt[String(w)];
    return sum + (typeof v === "number" ? v : flat);
  }, 0);

  const wv = kpi.weeklyValues ?? [];
  const achieved = wv
    .filter((v) => v.weekNumber < currentWeek)
    .reduce((sum, v) => sum + (v.value ?? 0), 0);

  return { qtdGoal: goal, qtdAchieved: achieved };
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
