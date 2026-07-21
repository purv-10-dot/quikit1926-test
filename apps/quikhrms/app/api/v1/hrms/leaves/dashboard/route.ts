import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GET /api/v1/hrms/leaves/dashboard?year=&month= — leave analytics.
 * Tiles (Requested/Responded/Not-Responded, Approved, Rejected/Self-cancelled),
 * a 12-month Requested/Approved/Rejected trend for the year, and the top-10
 * leave takers (by approved leave days) for the selected period.
 * `month` (1-12) narrows the tiles + top-10; the trend always spans the year.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const monthParam = searchParams.get("month");
    const month = monthParam && monthParam.trim() !== "" ? Number(monthParam) : null; // 1-12

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const requests = await prisma.leaveRequest.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: { not: "Draft" },
        appliedOn: { gte: yearStart, lt: yearEnd },
      },
      select: {
        status: true,
        appliedOn: true,
        employeeId: true,
        duration: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    // 12-month trend (whole year, regardless of the month filter).
    const series = MONTHS.map((name) => ({ name, requested: 0, approved: 0, rejected: 0 }));
    for (const r of requests) {
      const m = new Date(r.appliedOn).getUTCMonth();
      series[m].requested++;
      if (r.status === "Approved") series[m].approved++;
      else if (r.status === "Rejected") series[m].rejected++;
    }

    // Tiles + top-10 for the selected period (month if given, else whole year).
    const inPeriod = month != null
      ? requests.filter((r) => new Date(r.appliedOn).getUTCMonth() === month - 1)
      : requests;

    const tiles = { totalRequested: 0, responded: 0, notResponded: 0, approved: 0, rejected: 0, selfCancelled: 0 };
    const takers = new Map<string, { name: string; value: number }>();
    for (const r of inPeriod) {
      tiles.totalRequested++;
      if (r.status === "Pending") tiles.notResponded++;
      else tiles.responded++;

      if (r.status === "Approved") {
        tiles.approved++;
        const cur = takers.get(r.employeeId) ?? { name: `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim(), value: 0 };
        cur.value += Number(r.duration);
        takers.set(r.employeeId, cur);
      } else if (r.status === "Rejected") {
        tiles.rejected++;
      } else if (r.status === "Cancelled" || r.status === "Recalled") {
        tiles.selfCancelled++;
      }
    }
    const topTakers = [...takers.values()].sort((a, b) => b.value - a.value).slice(0, 10);

    return successResponse({ year, month, tiles, series, topTakers });
  } catch (error) {
    console.error("GET /leaves/dashboard error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });
