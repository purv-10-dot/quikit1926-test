import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { computeWidget, isWidgetType } from "@/lib/services/dashboard-widgets";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const months = Number(url.searchParams.get("months") ?? 12);
    // Validate against the single source of truth in dashboard-widgets.ts.
    if (!type || !isWidgetType(type)) return validationError("invalid widget type");

    const result = await computeWidget(orgId, type, months);
    return successResponse(result);
  } catch (e) {
    console.error("GET /dashboards/widget-data error:", e);
    return internalError();
  }
});
