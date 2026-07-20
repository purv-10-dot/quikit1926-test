import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/** POST body: { reason?: string } — archive candidate. */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason ? String(body.reason).trim() : null;

    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");
    if (existing.isArchived) return validationError("Candidate is already archived");

    const updated = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        isArchived: true,
        archiveReason: reason,
        archivedAt: new Date(),
        archivedBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Candidate", entityId: params.id,
      changes: { action: "Archived", reason },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /recruit/candidates/:id/archive error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");
    if (!existing.isArchived) return validationError("Candidate is not archived");

    const updated = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        isArchived: false,
        archiveReason: null,
        archivedAt: null,
        archivedBy: null,
        updatedBy: userId,
      },
    });

    // If this candidate was archived while On Hold in the pipeline, restoring
    // them reactivates the held application so they reappear on the board at
    // their current stage.
    const reactivated = await prisma.jobApplication.updateMany({
      where: { orgId, candidateId: params.id, status: "AppOnHold" },
      data: { status: "AppActive", updatedBy: userId },
    });
    if (reactivated.count > 0) {
      await prisma.candidate.update({
        where: { id: params.id },
        data: { status: "InPipeline" },
      }).catch(() => null);
    }

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Candidate", entityId: params.id,
      changes: { action: "Unarchived" },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("DELETE /recruit/candidates/:id/archive error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
