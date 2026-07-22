import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getCached, cacheKeys } from "@/lib/services/cache";
import { APP_ID, rolePriority } from "@/lib/rbac/registry";

export const GET = withServiceAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employee = await getCached(
      cacheKeys.employeeMe(orgId, userId),
      300,
      async () => {
        const employeeId = await resolveEmployeeId(orgId, userId);
        if (!employeeId) return null;
        const emp = await prisma.employee.findFirst({
          where: { id: employeeId, orgId, deletedAt: null },
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true,
            jobTitle: true, profilePhoto: true, status: true, reportingManagerId: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
            appRoles: {
              where: { orgId: orgId, role: { appId: APP_ID } },
              select: { role: { select: { id: true, name: true, description: true } } },
              take: 1,
            },
          },
        });
        if (!emp) return null;
        const primary = emp.appRoles[0]?.role ?? null;
        // UI back-compat: emit role.{code,name,priority}.
        const role = primary
          ? { code: primary.name, name: primary.name, priority: rolePriority(primary.name) }
          : null;
        const { appRoles: _appRoles, ...rest } = emp;
        void _appRoles;
        return { ...rest, role };
      },
    );
    if (!employee) return notFound("Employee record not found");
    return successResponse(employee);
  } catch (error) {
    console.error("GET /employees/me error:", error);
    return internalError();
  }
});
