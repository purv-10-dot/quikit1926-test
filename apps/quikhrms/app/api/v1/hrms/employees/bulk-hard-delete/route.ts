import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { cascadeHardDeleteEmployee } from "@/lib/services/employee-cascade";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { fireWorkflow } from "@/lib/workflows/executor";
import { createAuditLog } from "@/lib/utils/audit";

const bodySchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * POST /api/v1/hrms/employees/bulk-hard-delete
 * Hard-deletes employees + ALL related data. Irreversible.
 * Requires hrms.employee.delete permission.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.employee.findMany({
      where: { id: { in: parsed.data.employeeIds }, orgId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    const ids = existing.map((e) => e.id);
    if (ids.length === 0) return successResponse({ deleted: 0, skipped: parsed.data.employeeIds.length });

    try {
      await ensureSuperAdminRemains(orgId, ids, null);
    } catch (e) {
      return validationError(e instanceof Error ? e.message : "Super admin guard failed");
    }

    let deleted = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const e of existing) {
      try {
        const result = await cascadeHardDeleteEmployee(orgId, e.id);
        deleted++;
        await createAuditLog({
          orgId, userId, action: "Delete", entityType: "Employee", entityId: e.id,
          changes: { hardDelete: true, employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}`, tables: result.tables },
        });
        void fireWorkflow({ orgId, event: "employee.hard-deleted", payload: { employeeId: e.id } });
      } catch (err) {
        errors.push({ id: e.id, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    void scheduleOrgChartRebuild(orgId, "employee.bulk-hard-delete", userId);

    return successResponse({
      deleted,
      skipped: parsed.data.employeeIds.length - ids.length,
      errors,
    });
  } catch (error) {
    console.error("POST /employees/bulk-hard-delete error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.delete"] });
