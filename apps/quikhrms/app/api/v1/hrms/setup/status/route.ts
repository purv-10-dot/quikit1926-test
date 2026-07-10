import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { computeHrmsSetupProgress } from "@/lib/services/hrms-setup";

/**
 * First-run org-setup progress for the HRMS admin onboarding gate.
 * Auto-detects completion from existing records and latches the org-wide
 * `hrmsSetupCompleted` flag once all items pass (see hrms-setup service).
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const progress = await computeHrmsSetupProgress(orgId, userId);
    return successResponse(progress);
  } catch (e) {
    console.error("GET /hrms/setup/status error:", e);
    return internalError();
  }
});
