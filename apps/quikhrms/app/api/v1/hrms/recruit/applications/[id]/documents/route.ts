import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { triggerCandidateDocRequest } from "@/lib/services/candidate-doc-service";

/**
 * GET  — HR fetches document-request status (request + uploads + doc types).
 * POST — HR triggers (or re-triggers) a document request. Fires mail.
 *
 * One request per application — no Before/After Offer split. HR can request
 * any document type at any time.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!app) return notFound("Application not found");

    const docTypes = await prisma.candidateDocumentType.findMany({
      where: { orgId, isActive: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });

    const request = await prisma.candidateDocumentRequest.findFirst({
      where: { orgId, applicationId: params.id, deletedAt: null },
      include: {
        uploads: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: "desc" },
          include: {
            documentType: { select: { id: true, name: true, code: true, isRequired: true } },
          },
        },
      },
    });

    // Completion metrics
    const requiredCodes = docTypes.filter((d) => d.isRequired).map((d) => d.code);
    const approvedCodesByType = new Set(
      (request?.uploads ?? [])
        .filter((u) => u.status === "Approved" && u.documentType?.code)
        .map((u) => u.documentType!.code),
    );
    const missingRequired = requiredCodes.filter((c) => !approvedCodesByType.has(c));

    return successResponse({
      docTypes,
      request,
      missingRequired,
      ready: request?.status === "Completed" || missingRequired.length === 0,
    });
  } catch (e) {
    console.error("GET docs request", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body?.documentTypeIds) ? body.documentTypeIds.filter((v: unknown) => typeof v === "string" && v.length > 0) : null;
    // Optional HR-set submission deadline (ISO date string). Reject a malformed value.
    let deadline: Date | null | undefined;
    if (typeof body?.submissionDeadline === "string" && body.submissionDeadline.trim()) {
      const d = new Date(body.submissionDeadline);
      if (Number.isNaN(d.getTime())) return validationError("Invalid submission deadline");
      deadline = d;
    } else if (body?.submissionDeadline === null) {
      deadline = null;
    }
    const r = await triggerCandidateDocRequest(orgId, params.id, userId, rawIds, deadline);
    return successResponse(r, undefined, 201);
  } catch (e) {
    console.error("POST docs request trigger", e);
    const msg = e instanceof Error ? e.message : "Trigger failed";
    return validationError(msg);
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
