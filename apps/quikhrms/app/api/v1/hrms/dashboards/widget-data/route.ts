import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError } from "@/lib/api-response";
import { computeWidget, isWidgetType } from "@/lib/services/dashboard-widgets";

// Compensation widgets expose salary/CTC figures — gate them behind the same
// permission as payroll analytics / compensation. Other widgets stay open.
const COMPENSATION_WIDGETS = new Set(["ctc-spend", "salary-by-department"]);

export const GET = withAuth(async (req: NextRequest, { orgId, permissions }) => {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const months = Number(url.searchParams.get("months") ?? 12);
    // Validate against the single source of truth in dashboard-widgets.ts.
    if (!type || !isWidgetType(type)) return validationError("invalid widget type");

    if (COMPENSATION_WIDGETS.has(type)) {
      const canSeeComp =
        permissions.includes("*") ||
        permissions.includes("hrms.settings.read") ||
        permissions.includes("hrms.settings.write") ||
        permissions.includes("hrms.payroll.read");
      if (!canSeeComp) return forbidden("You don't have permission to view compensation data.");
    }

    const result = await computeWidget(orgId, type, months);
    return successResponse(result);
  } catch (e) {
    console.error("GET /dashboards/widget-data error:", e);
    return internalError();
  }
});
