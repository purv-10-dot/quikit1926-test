import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { resolveFiscalYearStart } from "@/lib/api/fiscalYearStart";
const withOrgAuth = withOrgAuthForModule("opsp");

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
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  // Derived from the org's configured Quarter Settings (Q1 start month),
  // not the stale Org.fiscalYearStart column.
  const fiscalYearStart = await resolveFiscalYearStart(orgId);

  // Find the earliest OPSP record for this user in this tenant
  const earliest = await db.oPSPData.findFirst({
    where: { orgId, userId },
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
      reviewedQuarters: [],
    });
  }

  const startYear = earliest.year;
  const startQuarter = earliest.quarter;
  const targetYears = earliest.targetYears ?? 5;
  const endYear = startYear + targetYears - 1;

  // List of "{year}:{quarter}" keys whose status unlocks the *next* quarter
  // in the OPSP create page's picker. A quarter qualifies once it's been
  // finalized — review submission is no longer required to begin filling the
  // next quarter (kept inclusive of "reviewed" since that's a strictly later
  // state). Field name stays `reviewedQuarters` for backward compat with the
  // client; the semantic is "completed enough to unlock the next one".
  const reviewed = await db.oPSPData.findMany({
    where: { orgId, userId, status: { in: ["finalized", "reviewed"] } },
    select: { year: true, quarter: true },
  });
  const reviewedQuarters = reviewed.map((r) => `${r.year}:${r.quarter}`);

  return NextResponse.json({
    success: true,
    hasSetup: true,
    startYear,
    endYear,
    targetYears,
    startQuarter,
    fiscalYearStart,
    reviewedQuarters,
  });
});
