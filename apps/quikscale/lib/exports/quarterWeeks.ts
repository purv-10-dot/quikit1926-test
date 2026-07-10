/**
 * Resolve the week count for each requested quarter from the org's
 * QuarterSetting records (Custom-Quarter aware). Quarters without a record —
 * or with a null weekCount — default to 13. Server-only (imports db).
 */
import { db } from "@/lib/db";
import { getCurrentFiscalWeekFromStart } from "@/lib/utils/fiscal";

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
 * Resolve the "current week" for each requested quarter from the org's
 * QuarterSetting.startDate — the same value the KPI table's Weekly Goal column
 * uses (via `useCurrentWeek`). A past quarter clamps to its weekCount, a future
 * quarter is week 1. Quarters without a record default to week 1.
 *
 * Note: meeting-day anchoring (Custom Quarter Settings) is NOT applied here.
 * The Weekly Goal only depends on `currentWeek` when a KPI has explicit
 * per-week `weeklyTargets`; the common flat `target/weekCount` fallback is
 * week-independent, so the exported value matches the UI in the common case.
 */
export async function getQuarterCurrentWeeks(
  orgId: string,
  year: number,
  quarters: string[],
  weekCounts: Record<string, number>,
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const q of quarters) map[q] = 1;

  const rows = await db.quarterSetting.findMany({
    where: { orgId, fiscalYear: year, quarter: { in: quarters } },
    select: { quarter: true, startDate: true },
  });
  for (const r of rows) {
    map[r.quarter] = getCurrentFiscalWeekFromStart(r.startDate, weekCounts[r.quarter] ?? DEFAULT_WEEKS);
  }
  return map;
}

/** [1, 2, …, weekCount]. */
export function weekNumbers(weekCount: number): number[] {
  const n = Number.isFinite(weekCount) && weekCount > 0 ? Math.floor(weekCount) : DEFAULT_WEEKS;
  return Array.from({ length: n }, (_, i) => i + 1);
}
