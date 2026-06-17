import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { computeSetupProgress } from "@/lib/services/payroll";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const progress = await computeSetupProgress(orgId);
    return successResponse(progress);
  } catch (e) {
    console.error("GET /payroll/setup/status error:", e);
    return internalError();
  }
});
