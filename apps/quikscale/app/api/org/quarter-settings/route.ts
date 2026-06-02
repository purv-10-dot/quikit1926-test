/**
 * GET /api/org/quarter-settings
 *
 * Tenant-scoped read of `QuarterSetting` rows — returns each configured
 * (fiscalYear, quarter) pair together with its `startDate` and `endDate`.
 *
 * Consumed by `useQuarterStartDates` so the Priority modal/table can
 * render week-date labels anchored on the tenant's real quarter start
 * (the Monday on/before the 1st of the quarter's first month) instead
 * of the hardcoded `QUARTER_STARTS` calendar-month boundaries.
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       quarters: Array<{
 *         fiscalYear: number;
 *         quarter: string;
 *         startDate: string;   // "YYYY-MM-DD"
 *         endDate: string;     // "YYYY-MM-DD"
 *       }>
 *     }
 *   }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("kpi");

function ymd(d: Date): string {
  // Local-date YYYY-MM-DD (avoids the UTC midnight → previous-day surprise
  // that toISOString() can cause for callers in +TZ offsets).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withOrgAuth(async ({ orgId }) => {
  const rows = await db.quarterSetting.findMany({
    where: { orgId },
    select: { fiscalYear: true, quarter: true, startDate: true, endDate: true },
    orderBy: [{ fiscalYear: "asc" }, { quarter: "asc" }],
  });

  return NextResponse.json({
    success: true,
    data: {
      quarters: rows.map((r) => ({
        fiscalYear: r.fiscalYear,
        quarter: r.quarter,
        startDate: ymd(r.startDate),
        endDate: ymd(r.endDate),
      })),
    },
  });
}, { fallbackErrorMessage: "Failed to fetch quarter settings" });
