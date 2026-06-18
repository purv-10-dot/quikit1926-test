import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { computeOrgChart } from "@/lib/services/org-chart";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    // Computed live per request — no Redis cache (Redis is reserved for the
    // BullMQ queue + realtime pub/sub). The query is orgId-scoped.
    const data = await computeOrgChart(orgId);
    return successResponse(data);
  } catch (e) {
    console.error("GET /org-chart error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"] });
