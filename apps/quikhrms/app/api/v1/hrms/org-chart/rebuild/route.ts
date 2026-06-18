import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * The org-chart is now computed live on every GET (no Redis cache), so there
 * is nothing to rebuild. This endpoint is kept for backwards compatibility
 * with the existing "Rebuild" action and simply confirms the data is live.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    return successResponse({ orgId, status: "live" });
  } catch (e) {
    console.error("POST /org-chart/rebuild error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
