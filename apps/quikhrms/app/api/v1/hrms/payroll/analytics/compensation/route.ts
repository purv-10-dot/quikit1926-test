import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { computeCompensationAnalytics } from "@/lib/services/analytics-cache";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    // Computed live per request — no Redis cache (Redis is reserved for the
    // BullMQ queue + realtime pub/sub). The aggregate is orgId-scoped.
    const data = await computeCompensationAnalytics(orgId);
    return successResponse(data);
  } catch (error) {
    console.error("GET /payroll/analytics/compensation error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });
