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
