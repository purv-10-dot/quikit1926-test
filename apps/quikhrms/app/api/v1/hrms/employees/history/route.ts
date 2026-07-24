import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";

/**
 * GET /api/v1/hrms/employees/history
 *
 * Tenant-wide employment-history feed across every employee the caller is
 * allowed to see (scoped by leave/employee read permission + role hierarchy).
 * Powers the "All employees" default view on the Employment History page. Each
 * row carries a minimal `employee` object since EmploymentHistory has no FK
 * relation to Employee.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 300), 1000);

    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No employee read permission");

    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    // undefined → unrestricted (super admin / full org); otherwise limit to ids.
    const allowedIds = intersectEmployeeIds(scopeFilter.employeeIds, hierarchy);

    const history = await prisma.employmentHistory.findMany({
      where: { orgId, ...(allowedIds && { employeeId: { in: allowedIds } }) },
      orderBy: { effectiveDate: "desc" },
      take: limit,
    });

    // EmploymentHistory has no Employee relation — attach names in one query.
    const empIds = [...new Set(history.map((h) => h.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds }, orgId },
          select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const rows = history.map((h) => ({
      ...h,
      employee: empMap.get(h.employeeId) ?? null,
    }));

    return successResponse(rows);
  } catch (error) {
    console.error("GET /employees/history error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read", "hrms.employee.read_team"], anyPermission: true });
