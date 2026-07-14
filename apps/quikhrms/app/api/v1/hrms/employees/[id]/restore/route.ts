import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { restoreEmployee } from "@/lib/services/employee-cascade";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { fireWorkflow } from "@/lib/workflows/executor";
import { emitEmployeeIndex } from "@/lib/search/search-index";

/**
 * POST /api/v1/hrms/employees/:id/restore
 * Restore soft-deleted employee + related records that were soft-deleted in the same operation.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const result = await restoreEmployee(orgId, params.id, userId);

    void scheduleOrgChartRebuild(orgId, "employee.restored", userId);

    void fireWorkflow({
      orgId,
      event: "employee.restored",
      payload: { employeeId: params.id },
    });

    // Search index (§S-3): re-index the restored employee.
    emitEmployeeIndex(orgId, params.id, "update");

    return successResponse({ restored: true, cascade: result.tables });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Restore failed";
    if (msg.includes("not found") || msg.includes("not deleted")) {
      return notFound(msg);
    }
    console.error("POST /employees/:id/restore error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
