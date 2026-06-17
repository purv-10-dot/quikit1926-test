import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * Compensation analytics is now computed live on every GET (no Redis cache),
 * so there is nothing to pre-warm. This endpoint is kept for backwards
 * compatibility with the existing "Refresh" action and simply confirms the
 * data is already up to date.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    return successResponse({ orgId, status: "live" });
  } catch (e) {
    console.error("POST /payroll/analytics/compensation/refresh error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
