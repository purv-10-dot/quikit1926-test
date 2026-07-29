import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GET /api/v1/hrms/offboarding/attrition?year= — attrition analytics for
 * fully-exited employees (Employee.status = "Relieved"). Headline stats +
 * exits-by-month / by-department / by-reason breakdowns for the year.
 * Exits are bucketed by last-working-date.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year")) || new Date().getFullYear();

    const [exited, activeCount] = await Promise.all([
      prisma.employee.findMany({
        where: { orgId, status: "Relieved" },
        select: {
          id: true,
          dateOfJoining: true,
          lastWorkingDate: true,
          department: { select: { name: true } },
        },
      }),
      prisma.employee.count({ where: { orgId, status: "Active", deletedAt: null } }),
    ]);

    // Exit reason per employee (latest offboarding record).
    const offb = exited.length
      ? await prisma.offboardingInstance.findMany({
          where: { orgId, employeeId: { in: exited.map((e) => e.id) } },
          orderBy: { createdAt: "desc" },
          select: { employeeId: true, reason: true },
        })
      : [];
    const reasonByEmp = new Map<string, string>();
    for (const o of offb) if (!reasonByEmp.has(o.employeeId)) reasonByEmp.set(o.employeeId, o.reason);

    // Keep exits whose last-working-date falls in the selected year.
    const inYear = exited.filter((e) => e.lastWorkingDate && new Date(e.lastWorkingDate).getUTCFullYear() === year);

    const byMonth = MONTHS.map((name) => ({ name, value: 0 }));
    const byDeptMap = new Map<string, number>();
    const byReasonMap = new Map<string, number>();
    let tenureSum = 0;
    let tenureCount = 0;

    for (const e of inYear) {
      const lwd = new Date(e.lastWorkingDate!);
      byMonth[lwd.getUTCMonth()].value++;

      const dept = e.department?.name || "Unassigned";
      byDeptMap.set(dept, (byDeptMap.get(dept) ?? 0) + 1);

      const reason = reasonByEmp.get(e.id) || "Unspecified";
      byReasonMap.set(reason, (byReasonMap.get(reason) ?? 0) + 1);

      if (e.dateOfJoining) {
        const m = Math.max(0, (lwd.getFullYear() - e.dateOfJoining.getFullYear()) * 12 + (lwd.getMonth() - e.dateOfJoining.getMonth()));
        tenureSum += m;
        tenureCount++;
      }
    }

    const totalExits = inYear.length;
    const avgTenureMonths = tenureCount ? Math.round(tenureSum / tenureCount) : 0;
    // Share of the workforce that left: exits ÷ (current active + exits).
    const denom = activeCount + totalExits;
    const attritionRate = denom ? Math.round((totalExits / denom) * 1000) / 10 : 0;

    const toSorted = (m: Map<string, number>) =>
      [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    return successResponse({
      year,
      totalExits,
      activeCount,
      attritionRate,
      avgTenureMonths,
      byMonth,
      byDepartment: toSorted(byDeptMap),
      byReason: toSorted(byReasonMap),
    });
  } catch (error) {
    console.error("GET /offboarding/attrition error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.attrition.read"] });
