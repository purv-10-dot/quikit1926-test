/**
 * GET /api/org/fiscal-years
 *
 * Lightweight tenant-scoped endpoint used by the shared FiscalPeriodPicker.
 * Returns only the fiscal years + configured quarters from QuarterSetting —
 * no feature gate so every module (KPI, Priority, Dashboard, OPSP, modals)
 * can consume a single source of truth for the FY/Quarter picker.
 *
 * Response:
 *   { success: true, data: { years: number[], configured: Array<{ year: number; quarter: string }> } }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

// Use "kpi" module gate — every module that needs the picker has at least this
// license row. The endpoint itself is tenant-scoped and read-only.
const withTenantAuth = withTenantAuthForModule("kpi");

export const GET = withTenantAuth(async ({ orgId }) => {
  const rows = await db.quarterSetting.findMany({
    where: { orgId },
    select: { fiscalYear: true, quarter: true },
    orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
  });

  const yearsSet = new Set<number>();
  const configured: Array<{ year: number; quarter: string }> = [];
  for (const r of rows) {
    yearsSet.add(r.fiscalYear);
    configured.push({ year: r.fiscalYear, quarter: r.quarter });
  }

  return NextResponse.json({
    success: true,
    data: {
      years: [...yearsSet].sort((a, b) => b - a),
      configured,
    },
  });
}, { fallbackErrorMessage: "Failed to fetch fiscal years" });
