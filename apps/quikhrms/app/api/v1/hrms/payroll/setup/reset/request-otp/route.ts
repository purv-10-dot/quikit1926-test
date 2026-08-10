import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { requestPayrollResetOtp } from "@/lib/services/payroll-reset-otp";

/**
 * Issues a 4-digit OTP (10 min TTL) for the destructive payroll reset action,
 * emailed to the caller + every "admin"-role employee. Must be verified via
 * POST /payroll/setup/reset before the actual reset runs.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const { sent } = await requestPayrollResetOtp(orgId, userId);
    return successResponse({ sent });
  } catch (e) {
    console.error("POST /payroll/setup/reset/request-otp error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
