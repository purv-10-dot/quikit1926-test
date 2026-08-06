import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { sendCandidateDocReminder } from "@/lib/services/candidate-doc-service";
import type { DocumentBundle } from "@quikit/database";

const VALID_BUNDLES: DocumentBundle[] = ["PreOffer", "PostOffer"];
function isBundle(v: string): v is DocumentBundle {
  return (VALID_BUNDLES as string[]).includes(v);
}

/**
 * POST — HR triggers a reminder mail for an existing pending document request.
 * Increments reminderCount, refreshes token if expired, re-sends mail listing
 * still-pending documents.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    if (!isBundle(params.bundle)) return validationError("Invalid bundle");
    const r = await sendCandidateDocReminder(orgId, params.id, params.bundle, userId);
    return successResponse(r, undefined, 201);
  } catch (e) {
    console.error("POST docs bundle remind", e);
    const msg = e instanceof Error ? e.message : "Reminder failed";
    return validationError(msg);
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
