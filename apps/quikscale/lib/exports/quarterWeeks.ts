/**
 * Resolve the week count for each requested quarter from the org's
 * QuarterSetting records (Custom-Quarter aware). Quarters without a record —
 * or with a null weekCount — default to 13. Server-only (imports db).
 */
import { db } from "@/lib/db";
import { getCurrentFiscalWeekFromStart, qtdReferenceWeek } from "@/lib/utils/fiscal";

const DEFAULT_WEEKS = 13;

export async function getQuarterWeekCounts(
  orgId: string,
  year: number,
  quarters: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const q of quarters) map[q] = DEFAULT_WEEKS;

  const rows = await db.quarterSetting.findMany({
    where: { orgId, fiscalYear: year, quarter: { in: quarters } },
    select: { quarter: true, weekCount: true },
  });
  for (const r of rows) map[r.quarter] = r.weekCount ?? DEFAULT_WEEKS;
  return map;
}

/**
 * Per-quarter week timing the export needs to reproduce the KPI table / Stats
 * drawer numbers, resolved from the org's QuarterSetting date range:
 *
 *   - `currentWeek` — display week (`getCurrentFiscalWeekFromStart`), drives the
 *     Weekly Goal column. Past quarter clamps to weekCount, future → 1.
 *   - `qtdWeek`     — QTD reference week (`qtdReferenceWeek`), drives QTD Goal /
 *     Achieved / Progress. Differs from `currentWeek` ONLY for a past quarter
 *     (returns weekCount + 1 so the final week isn't dropped from QTD).
 *
 * Quarters without a QuarterSetting record default to week 1 for both.
 *
 * Note: meeting-day anchoring (Custom Quarter Settings) is NOT applied here.
 * The Weekly Goal only depends on the week when a KPI has explicit per-week
 * `weeklyTargets`; the common flat `target/weekCount` fallback is week-
 * independent, so the exported value matches the UI in the common case.
 */
export async function getQuarterWeekTiming(
  orgId: string,
  year: number,
  quarters: string[],
  weekCounts: Record<string, number>,
): Promise<Record<string, { currentWeek: number; qtdWeek: number }>> {
  const map: Record<string, { currentWeek: number; qtdWeek: number }> = {};
  for (const q of quarters) map[q] = { currentWeek: 1, qtdWeek: 1 };

  const rows = await db.quarterSetting.findMany({
    where: { orgId, fiscalYear: year, quarter: { in: quarters } },
    select: { quarter: true, startDate: true, endDate: true },
  });
  for (const r of rows) {
    const wc = weekCounts[r.quarter] ?? DEFAULT_WEEKS;
    map[r.quarter] = {
      currentWeek: getCurrentFiscalWeekFromStart(r.startDate, wc),
      qtdWeek: qtdReferenceWeek(r.startDate, r.endDate, wc),
    };
  }
  return map;
}

/** [1, 2, …, weekCount]. */
export function weekNumbers(weekCount: number): number[] {
  const n = Number.isFinite(weekCount) && weekCount > 0 ? Math.floor(weekCount) : DEFAULT_WEEKS;
  return Array.from({ length: n }, (_, i) => i + 1);
}
