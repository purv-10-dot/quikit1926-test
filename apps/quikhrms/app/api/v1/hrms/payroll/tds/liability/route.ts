import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

/**
 * List TDS liability periods.
 *
 * Filters:
 *   ?fy=2026-27           — Indian financial year (Apr–Mar)
 *   ?status=Overdue       — single status
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const fy = searchParams.get("fy");
    const status = searchParams.get("status");

    const where: Prisma.TdsLiabilityPeriodWhereInput = {
      orgId,
      ...(status && { status: status as Prisma.EnumTdsPeriodStatusFilter["equals"] }),
    };

    if (fy) {
      // FY "2026-27" → covers Apr 2026 through Mar 2027.
      const startYear = parseInt(fy.slice(0, 4), 10);
      if (!Number.isNaN(startYear)) {
        where.OR = [
          { periodYear: startYear, periodMonth: { gte: 4 } },
          { periodYear: startYear + 1, periodMonth: { lte: 3 } },
        ];
      }
    }

    const periods = await prisma.tdsLiabilityPeriod.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });

    // Aggregate summary cards for the same window
    const totalDeducted = periods.reduce((s, p) => s + Number(p.totalDeducted), 0);
    const totalAllocated = periods.reduce((s, p) => s + Number(p.totalAllocated), 0);
    const pending = totalDeducted - totalAllocated;
    const overdueCount = periods.filter((p) => p.status === "Overdue").length;

    return successResponse({
      periods,
      summary: { totalDeducted, totalAllocated, pending, overdueCount },
    });
  } catch (e) {
    console.error("GET /payroll/tds/liability error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });
