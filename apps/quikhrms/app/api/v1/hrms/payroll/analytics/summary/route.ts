import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const now = new Date();
    const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 3, 1);

    const [lastPaid, upcoming, upcomingRevisions, pendingRevisions] = await Promise.all([
      prisma.payRun.findFirst({
        where: { orgId, deletedAt: null, status: "Paid" },
        orderBy: { payDate: "desc" },
        select: { payDate: true, totalNet: true, totalGross: true, periodStart: true, periodEnd: true, employeeCount: true },
      }),
      prisma.payRun.findFirst({
        where: { orgId, deletedAt: null, status: { in: ["Draft", "Processing", "Approved"] }, payDate: { gte: now } },
        orderBy: { payDate: "asc" },
        select: { payDate: true, totalNet: true, totalGross: true, employeeCount: true },
      }),
      prisma.salaryRevision.count({
        where: {
          orgId,
          deletedAt: null,
          status: "Approved",
          effectiveFrom: { gte: now, lte: threeMonthsAhead },
        },
      }),
      prisma.salaryRevision.count({
        where: { orgId, deletedAt: null, status: "Pending" },
      }),
    ]);

    return successResponse({
      lastSalaryProcessed: lastPaid
        ? { amount: lastPaid.totalNet, month: lastPaid.payDate, employeeCount: lastPaid.employeeCount }
        : null,
      upcomingSalary: upcoming
        ? { amount: upcoming.totalNet, month: upcoming.payDate, employeeCount: upcoming.employeeCount }
        : null,
      upcomingRevisions: { count: upcomingRevisions, windowMonths: 3 },
      pendingRevisions: { count: pendingRevisions },
    });
  } catch (e) {
    console.error("GET /payroll/analytics/summary error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });
