import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, validationError, internalError } from "@/lib/api-response";
import { weeklyOffsSchema } from "@/lib/validations/roster";
import { getHierarchyAccessibleEmployeeIds } from "@/lib/rbac/hierarchy";

/**
 * PUT /api/v1/hrms/roster/weekly-offs — set the default weekly-off days
 * (e.g. ["Saturday","Sunday"]) for one or many employees.
 */
export const PUT = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    if (!(permissions.includes("*") || permissions.includes("hrms.roster.manage"))) {
      return forbidden("No roster manage permission");
    }
    const body = await req.json();
    const parsed = weeklyOffsSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { employeeIds, days } = parsed.data;

    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    if (!hierarchy.unlimited) {
      const allowed = new Set(hierarchy.employeeIds ?? []);
      if (employeeIds.some((id) => !allowed.has(id))) {
        return forbidden("Cannot set week-offs for an employee above your role hierarchy");
      }
    }

    const result = await prisma.employee.updateMany({
      where: { orgId, deletedAt: null, id: { in: employeeIds } },
      data: { weeklyOffDays: days },
    });
    return successResponse({ count: result.count, days });
  } catch (error) {
    console.error("PUT /roster/weekly-offs error:", error);
    return internalError();
  }
});
