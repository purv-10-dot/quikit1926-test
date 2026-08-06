import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getAttritionAnalytics } from "@/lib/services/reports";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    // Bounded, NaN-safe: an unvalidated parseInt let a bad value corrupt the
    // cutoff date (NaN) or widen the scan (huge values).
    const parsedMonths = z.coerce.number().int().min(1).max(60).safeParse(searchParams.get("months") ?? "12");
    const months = parsedMonths.success ? parsedMonths.data : 12;
    const data = await getAttritionAnalytics(orgId, months);
    return successResponse(data);
  } catch (error) {
    console.error("GET /analytics/attrition error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.dashboard.admin", "hrms.offboarding.attrition.read"],
  anyPermission: true,
});
