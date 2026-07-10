import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound } from "@/lib/api-response";
import { sendCandidateDocReminder } from "@/lib/services/candidate-doc-service";
import type { DocumentBundle } from "@quikit/database";

const VALID_BUNDLES: DocumentBundle[] = ["PreOffer", "PostOffer"];
function isBundle(v: string): v is DocumentBundle {
  return (VALID_BUNDLES as string[]).includes(v);
}

/**
 * POST — HR re-requests documents after rejecting one or more uploads.
 *
 * Once the candidate hits "Submit for Review" the portal locks all uploads
 * (see candidate-documents/[token]/upload — `submittedAt` guard), so a rejected
 * file can't be replaced until HR re-opens the packet. This clears that lock,
 * puts the request back to Pending, and re-sends the doc email (which lists
 * every not-yet-approved document — including the rejected ones).
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    if (!isBundle(params.bundle)) return validationError("Invalid bundle");

    const request = await prisma.candidateDocumentRequest.findFirst({
      where: { orgId, applicationId: params.id, bundle: params.bundle, deletedAt: null },
      select: { id: true },
    });
    if (!request) return notFound("No document request exists for this bundle.");

    // Re-open: clear the submit lock + completion so the portal accepts a fresh
    // upload for the rejected slot (re-uploading resets that doc to Pending).
    await prisma.candidateDocumentRequest.update({
      where: { id: request.id },
      data: { submittedAt: null, status: "Pending", completedAt: null, updatedBy: userId },
    });

    const r = await sendCandidateDocReminder(orgId, params.id, params.bundle, userId);
    return successResponse(r, undefined, 201);
  } catch (e) {
    console.error("POST docs bundle reopen", e);
    const msg = e instanceof Error ? e.message : "Re-request failed";
    return validationError(msg);
  }
});
