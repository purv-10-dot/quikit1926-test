import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getAttritionAnalytics } from "@/lib/services/reports";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const months = parseInt(searchParams.get("months") ?? "12", 10);
    const data = await getAttritionAnalytics(orgId, months);
    return successResponse(data);
  } catch (error) {
    console.error("GET /analytics/attrition error:", error);
    return internalError();
  }
});
