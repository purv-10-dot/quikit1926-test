import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * DELETE /api/v1/hrms/invitations/:id — remove an invitation from the list.
 * Soft-deletes the record regardless of status (Pending/Expired/Accepted/Revoked).
 * This only removes the invitation entry; an already-accepted user's account is
 * left untouched.
 */
export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const invitation = await prisma.invitation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!invitation) return notFound("Invitation not found");

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "Invitation", entityId: invitation.id,
      metadata: { action: "delete", email: invitation.email, status: invitation.status },
    });

    return successResponse({ id: invitation.id, deleted: true });
  } catch (error) {
    console.error("DELETE /invitations/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });
