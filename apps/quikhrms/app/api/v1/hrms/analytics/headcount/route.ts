import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getHeadcountAnalytics } from "@/lib/services/reports";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const data = await getHeadcountAnalytics(orgId);
    return successResponse(data);
  } catch (error) {
    console.error("GET /analytics/headcount error:", error);
    return internalError();
  }
});
