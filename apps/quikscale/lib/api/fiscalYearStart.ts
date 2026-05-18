import { db } from "@/lib/db";

/**
 * Resolve the org's fiscal-year start MONTH (1–12).
 *
 * Source of truth = the quarters the user actually configured in Quarter
 * Settings: the month of the earliest `QuarterSetting` Q1 `startDate`
 * (e.g. quarters started 2026-04-01 → 4 → "FY 2026–2027" labels).
 *
 * `Org.fiscalYearStart` is a legacy column defaulting to 1 (January) that
 * Quarter Settings never writes, so it was leaking calendar-year labels
 * for April-based fiscal years. It is now only the fallback, used (then
 * finally `1`) when the org has no quarters yet.
 *
 * UTC month: QuarterSetting dates are generated normalized, so the
 * calendar month is stable on read regardless of server timezone.
 */
export async function resolveFiscalYearStart(orgId: string): Promise<number> {
  const q1 = await db.quarterSetting.findFirst({
    where: { orgId, quarter: "Q1" },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  if (q1) return q1.startDate.getUTCMonth() + 1;

  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { fiscalYearStart: true },
  });
  return org?.fiscalYearStart ?? 1;
}
