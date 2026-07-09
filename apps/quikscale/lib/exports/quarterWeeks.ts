/**
 * Resolve the week count for each requested quarter from the org's
 * QuarterSetting records (Custom-Quarter aware). Quarters without a record —
 * or with a null weekCount — default to 13. Server-only (imports db).
 */
import { db } from "@/lib/db";

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

/** [1, 2, …, weekCount]. */
export function weekNumbers(weekCount: number): number[] {
  const n = Number.isFinite(weekCount) && weekCount > 0 ? Math.floor(weekCount) : DEFAULT_WEEKS;
  return Array.from({ length: n }, (_, i) => i + 1);
}
