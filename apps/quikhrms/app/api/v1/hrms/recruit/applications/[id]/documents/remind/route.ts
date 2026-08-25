import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError } from "@/lib/api-response";
import { sendCandidateDocReminder } from "@/lib/services/candidate-doc-service";

/**
 * POST — HR triggers a reminder mail for an existing pending document request.
 * Increments reminderCount, refreshes token if expired, re-sends mail listing
 * still-pending documents.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const r = await sendCandidateDocReminder(orgId, params.id, userId);
    return successResponse(r, undefined, 201);
  } catch (e) {
    console.error("POST docs remind", e);
    const msg = e instanceof Error ? e.message : "Reminder failed";
    return validationError(msg);
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
