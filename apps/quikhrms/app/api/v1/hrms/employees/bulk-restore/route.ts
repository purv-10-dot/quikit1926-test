import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { restoreEmployee } from "@/lib/services/employee-cascade";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { fireWorkflow } from "@/lib/workflows/executor";

const bodySchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * POST /api/v1/hrms/employees/bulk-restore
 * Restores multiple soft-deleted employees + cascade-restored related records.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.employee.findMany({
      where: { id: { in: parsed.data.employeeIds }, orgId, deletedAt: { not: null } },
      select: { id: true },
    });
    const ids = existing.map((e) => e.id);
    if (ids.length === 0) return successResponse({ restored: 0, skipped: parsed.data.employeeIds.length });

    let restored = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        await restoreEmployee(orgId, id, userId);
        restored++;
        void fireWorkflow({ orgId, event: "employee.restored", payload: { employeeId: id } });
      } catch (err) {
        errors.push({ id, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    void scheduleOrgChartRebuild(orgId, "employee.bulk-restore", userId);

    return successResponse({
      restored,
      skipped: parsed.data.employeeIds.length - ids.length,
      errors,
    });
  } catch (error) {
    console.error("POST /employees/bulk-restore error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
