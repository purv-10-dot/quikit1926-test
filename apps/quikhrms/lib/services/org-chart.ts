import { prisma } from "@/lib/prisma";
import { APP_ID } from "@/lib/rbac/registry";

/**
 * Org-chart for one tenant, computed on demand per request. No Redis — the
 * endpoint runs the query directly (Redis is reserved for the BullMQ queue +
 * realtime pub/sub). The query is `orgId`-scoped.
 */

export interface OrgChartEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  profilePhoto: string | null;
  status: string;
  reportingManagerId: string | null;
  roleId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
}

export interface OrgChartSnapshot {
  orgId: string;
  refreshedAt: string;
  employeeCount: number;
  employees: OrgChartEmployee[];
}

export async function computeOrgChart(orgId: string): Promise<OrgChartSnapshot> {
  const rows = await prisma.employee.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      workEmail: true,
      personalEmail: true,
      profilePhoto: true,
      status: true,
      reportingManagerId: true,
      appRoles: {
        where: { orgId: orgId, role: { appId: APP_ID } },
        select: { roleId: true },
        take: 1,
      },
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, title: true } },
    },
    orderBy: [{ employeeCode: "asc" }],
  });

  const employees: OrgChartEmployee[] = rows.map((r) => ({
    id: r.id,
    employeeCode: r.employeeCode,
    firstName: r.firstName,
    lastName: r.lastName,
    jobTitle: r.jobTitle,
    workEmail: r.workEmail,
    personalEmail: r.personalEmail,
    profilePhoto: r.profilePhoto,
    status: r.status,
    reportingManagerId: r.reportingManagerId,
    roleId: r.appRoles[0]?.roleId ?? null,
    department: r.department,
    designation: r.designation,
  }));

  return {
    orgId,
    refreshedAt: new Date().toISOString(),
    employeeCount: employees.length,
    employees,
  };
}
