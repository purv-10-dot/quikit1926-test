import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { cascadeSoftDeleteEmployee } from "@/lib/services/employee-cascade";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { fireWorkflow } from "@/lib/workflows/executor";

const bodySchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * POST /api/v1/hrms/employees/bulk-delete
 * Soft-deletes multiple employees + cascades related records (per cascade service).
 * Skips already-deleted IDs. Last super_admin guard runs across the batch.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Filter to existing, non-deleted, in-tenant
    const existing = await prisma.employee.findMany({
      where: { id: { in: parsed.data.employeeIds }, orgId, deletedAt: null },
      select: { id: true },
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
    for (const id of ids) {
      try {
        await cascadeSoftDeleteEmployee(orgId, id, userId);
        deleted++;
        void fireWorkflow({ orgId, event: "employee.deleted", payload: { employeeId: id } });
      } catch (err) {
        errors.push({ id, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    void scheduleOrgChartRebuild(orgId, "employee.bulk-delete", userId);

    return successResponse({
      deleted,
      skipped: parsed.data.employeeIds.length - ids.length,
      errors,
    });
  } catch (error) {
    console.error("POST /employees/bulk-delete error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
