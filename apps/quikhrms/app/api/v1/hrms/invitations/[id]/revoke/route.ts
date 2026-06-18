import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/** POST /api/v1/hrms/invitations/:id/revoke — soft-delete + mark revoked. */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const invitation = await prisma.invitation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!invitation) return notFound("Invitation not found");
    if (invitation.status === "Accepted") return conflict("Cannot revoke an accepted invitation");

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "Revoked", deletedAt: new Date() },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "Invitation", entityId: invitation.id,
      metadata: { action: "revoke", email: invitation.email },
    });

    return successResponse({ id: invitation.id, status: "Revoked" });
  } catch (error) {
    console.error("POST /invitations/:id/revoke error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });
