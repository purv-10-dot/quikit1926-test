import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("opsp.history");

/**
 * GET /api/opsp/history?year=2026
 *
 * Returns all OPSP records for the logged-in user's tenant for the given
 * fiscal year, plus available fiscal years and tenant fiscal config.
 */
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { fiscalYearStart: true },
  });
  const fiscalYearStart = tenant?.fiscalYearStart ?? 1;

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam) : null;

  // Fetch all distinct years that have OPSP data for this tenant
  const allYearsRaw = await db.oPSPData.findMany({
    where: { tenantId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  const availableYears = allYearsRaw.map(r => r.year);

  // Fetch OPSPs for the requested year (all users in the tenant)
  const where: Record<string, unknown> = { tenantId };
  if (year) where.year = year;

  const opsps = await db.oPSPData.findMany({
    where,
    select: {
      id: true,
      userId: true,
      year: true,
      quarter: true,
      status: true,
      targetYears: true,
      createdAt: true,
      updatedAt: true,
      employees: true,
      bhag: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ year: "desc" }, { quarter: "asc" }],
  });

  // Also check if quarters are initialized for this fiscal year
  const quarterSettings = year
    ? await db.quarterSetting.findMany({
        where: { tenantId, fiscalYear: year },
        select: { quarter: true },
      })
    : [];

  return NextResponse.json({
    success: true,
    data: opsps,
    availableYears,
    initializedQuarters: quarterSettings.map(q => q.quarter),
    fiscalYearStart,
  });
});
