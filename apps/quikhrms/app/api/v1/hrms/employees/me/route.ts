import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { authOptions } from "@/lib/auth";
import { successResponse, internalError } from "@/lib/api-response";
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
    if (!employee) {
      // A missing linked profile is not an error state — return a minimal
      // fallback (200) so the UI can render (e.g. the top-bar greeting) without
      // logging a 404 on every page.
      const session = await getServerSession(authOptions);
      const displayName = session?.user?.name?.trim() ?? "";
      const firstName = displayName.split(/\s+/)[0] || "";
      return successResponse({
        id: null, employeeCode: null,
        firstName, lastName: "",
        jobTitle: null, profilePhoto: null, status: null, reportingManagerId: null,
        department: null, designation: null, role: null,
      });
    }
    return successResponse(employee);
  } catch (error) {
    console.error("GET /employees/me error:", error);
    return internalError();
  }
});
