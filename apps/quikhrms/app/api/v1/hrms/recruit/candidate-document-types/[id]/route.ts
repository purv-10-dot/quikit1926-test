import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidateDocumentType.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Document type not found");

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = { updatedBy: userId };
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (body.bundle === "PreOffer" || body.bundle === "PostOffer") update.bundle = body.bundle;
    if (typeof body.isRequired === "boolean") update.isRequired = body.isRequired;
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (typeof body.helpText === "string" || body.helpText === null) update.helpText = body.helpText?.trim?.() || null;
    if (typeof body.sortOrder === "number") update.sortOrder = body.sortOrder;

    const saved = await prisma.candidateDocumentType.update({
      where: { id: existing.id },
      data: update,
    });
    return successResponse(saved);
  } catch (e) {
    console.error("PATCH candidate-document-type", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidateDocumentType.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Document type not found");

    // Block delete if any uploads reference it
    const uploadCount = await prisma.candidateDocumentUpload.count({
      where: { orgId, documentTypeId: existing.id, deletedAt: null },
    });
    if (uploadCount > 0) {
      // Soft-delete: mark inactive instead of hard delete when in use
      const saved = await prisma.candidateDocumentType.update({
        where: { id: existing.id },
        data: { isActive: false, updatedBy: userId },
      });
      return successResponse({ ...saved, softDisabled: true, reason: `${uploadCount} upload(s) reference this — disabled instead of deleted.` });
    }

    const saved = await prisma.candidateDocumentType.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });
    return successResponse(saved);
  } catch (e) {
    console.error("DELETE candidate-document-type", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
