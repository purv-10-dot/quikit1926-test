import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("opsp");

/**
 * GET /api/opsp/config
 *
 * Returns the OPSP plan configuration for the current user:
 * - startYear: year of the earliest OPSPData record
 * - targetYears: target duration (3-5)
 * - endYear: startYear + targetYears - 1
 * - hasSetup: whether any OPSP record exists (wizard completed)
 * - fiscalYearStart: tenant setting
 */
export const GET = withTenantAuth(async ({ tenantId, userId }) => {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { fiscalYearStart: true },
  });
  const fiscalYearStart = tenant?.fiscalYearStart ?? 1;

  // Find the earliest OPSP record for this user in this tenant
  const earliest = await db.oPSPData.findFirst({
    where: { tenantId, userId },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
    select: { year: true, quarter: true, targetYears: true },
  });

  if (!earliest) {
    return NextResponse.json({
      success: true,
      hasSetup: false,
      startYear: null,
      endYear: null,
      targetYears: null,
      startQuarter: null,
      fiscalYearStart,
    });
  }

  const startYear = earliest.year;
  const startQuarter = earliest.quarter;
  const targetYears = earliest.targetYears ?? 5;
  const endYear = startYear + targetYears - 1;

  return NextResponse.json({
    success: true,
    hasSetup: true,
    startYear,
    endYear,
    targetYears,
    startQuarter,
    fiscalYearStart,
  });
});
