import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError, forbidden } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";

/** GET /api/v1/hrms/employees/by-code/:code — full employee detail, looked up by employeeCode (e.g. QK-EMP-0001) instead of the internal id */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;

    const employee = await prisma.employee.findFirst({
      where: { employeeCode: params.code, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true } },
        team: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true, level: true } },
        grade: { select: { id: true, name: true, level: true } },
        officeLocation: { select: { id: true, name: true, city: true, country: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true, employeeCode: true },
        },
        dottedLineManager: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true },
        },
        directReports: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true, employeeCode: true },
        },
        appRoles: {
          take: 1,
          select: {
            roleId: true,
            role: { select: { id: true, name: true, description: true } },
          },
        },
      },
    });

    if (!employee) return notFound("Employee not found");

    // Same access guard as GET /employees/:id — a user may only open profiles
    // within their scope (self / team / all-by-hierarchy / super_admin).
    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No access to employee profiles");
    const callerId = await resolveEmployeeId(orgId, ctx.userId);
    const allowed = sf.employeeIds === undefined || employee.id === callerId || sf.employeeIds.includes(employee.id);
    if (!allowed) return forbidden("You don't have access to this employee's profile");

    const primary = employee.appRoles[0] ?? null;
    const { appRoles: _appRoles, ...rest } = employee;
    void _appRoles;
    const shaped = {
      ...rest,
      roleId: primary?.roleId ?? null,
      role: primary?.role
        ? { id: primary.role.id, code: primary.role.name, name: primary.role.name, description: primary.role.description }
        : null,
    };

    return successResponse(shaped);
  } catch (error) {
    console.error("GET /employees/by-code/:code error:", error);
    return internalError();
  }
});
