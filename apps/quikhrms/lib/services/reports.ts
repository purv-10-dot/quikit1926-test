import { prisma } from "@/lib/prisma";

export async function getHeadcountAnalytics(orgId: string) {
  const [total, byStatus, byDept, byEmployment, byLocation] = await Promise.all([
    prisma.employee.count({ where: { orgId, deletedAt: null } }),
    prisma.employee.groupBy({ by: ["status"], where: { orgId, deletedAt: null }, _count: true }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { orgId, deletedAt: null }, _count: true }),
    prisma.employee.groupBy({ by: ["employmentType"], where: { orgId, deletedAt: null }, _count: true }),
    prisma.employee.groupBy({ by: ["workLocation"], where: { orgId, deletedAt: null }, _count: true }),
  ]);

  const deptNames = await prisma.department.findMany({
    where: { orgId, id: { in: byDept.map((d) => d.departmentId).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const deptMap = new Map(deptNames.map((d) => [d.id, d.name]));

  return {
    total,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    byDepartment: byDept.map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.departmentId ? (deptMap.get(d.departmentId) ?? "Unknown") : "Unassigned",
      count: d._count,
    })),
    byEmploymentType: byEmployment.map((e) => ({ type: e.employmentType, count: e._count })),
    byWorkLocation: byLocation.map((l) => ({ location: l.workLocation, count: l._count })),
  };
}

export async function getAttritionAnalytics(orgId: string, months = 12) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const [relieved, hired, totalActive] = await Promise.all([
    prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Relieved",
        lastWorkingDate: { gte: cutoff },
      },
      select: { id: true, lastWorkingDate: true, dateOfJoining: true, departmentId: true },
    }),
    prisma.employee.count({
      where: { orgId, deletedAt: null, dateOfJoining: { gte: cutoff } },
    }),
    prisma.employee.count({
      where: { orgId, deletedAt: null, status: "Active" },
    }),
  ]);

  const byMonth: Record<string, number> = {};
  for (const r of relieved) {
    if (!r.lastWorkingDate) continue;
    const key = `${r.lastWorkingDate.getFullYear()}-${String(r.lastWorkingDate.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  const byTenure = {
    "0-6m": 0, "6-12m": 0, "1-2y": 0, "2-5y": 0, "5y+": 0,
  };
  for (const r of relieved) {
    if (!r.lastWorkingDate) continue;
    const months = (r.lastWorkingDate.getTime() - r.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months < 6) byTenure["0-6m"] += 1;
    else if (months < 12) byTenure["6-12m"] += 1;
    else if (months < 24) byTenure["1-2y"] += 1;
    else if (months < 60) byTenure["2-5y"] += 1;
    else byTenure["5y+"] += 1;
  }

  const attritionRate = totalActive > 0 ? ((relieved.length / (totalActive + relieved.length)) * 100).toFixed(2) : "0";

  return {
    totalExits: relieved.length,
    totalHired: hired,
    activeHeadcount: totalActive,
    attritionRate: Number(attritionRate),
    byMonth: Object.entries(byMonth).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
    byTenure,
  };
}

export async function getOverviewAnalytics(orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalEmployees, activeOnLeave, onboardings, offboardings, pendingLeaves, pendingExpenses, openRequisitions] = await Promise.all([
    prisma.employee.count({ where: { orgId, deletedAt: null, status: "Active" } }),
    prisma.employee.count({ where: { orgId, deletedAt: null, status: "OnLeave" } }),
    prisma.onboardingInstance.count({ where: { orgId, deletedAt: null, status: "InProgress" } }),
    prisma.offboardingInstance.count({ where: { orgId, deletedAt: null, status: { notIn: ["OffboardCompleted"] } } }),
    prisma.leaveRequest.count({ where: { orgId, deletedAt: null, status: "Pending" } }),
    prisma.expenseClaim.count({ where: { orgId, deletedAt: null, status: { in: ["Submitted", "ManagerApproved", "FinanceApproved"] } } }),
    prisma.jobRequisition.count({ where: { orgId, deletedAt: null, status: "ReqOpen" } }),
  ]);

  const newHires = await prisma.employee.count({
    where: { orgId, deletedAt: null, dateOfJoining: { gte: monthStart } },
  });

  return {
    headcount: { active: totalEmployees, onLeave: activeOnLeave, newHiresThisMonth: newHires },
    workflows: { activeOnboardings: onboardings, activeOffboardings: offboardings },
    pending: { leaves: pendingLeaves, expenses: pendingExpenses, openRequisitions },
  };
}
