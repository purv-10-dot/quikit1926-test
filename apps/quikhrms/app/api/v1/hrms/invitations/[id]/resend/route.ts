import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { provisionCentralInvite } from "@/lib/services/invitation";
import { createAuditLog } from "@/lib/utils/audit";

/** POST /api/v1/hrms/invitations/:id/resend — re-provision + re-send the invite. */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const invitation = await prisma.invitation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!invitation) return notFound("Invitation not found");
    if (invitation.status === "Accepted") return conflict("Invitation already accepted");

    // Re-provision directly against central (idempotent) — refreshes the token
    // and re-sends the onboarding invite email. Same path as a fresh invite.
    const invite = await provisionCentralInvite({
      orgId,
      invitedBy: userId,
      email: invitation.email,
      firstName: invitation.firstName ?? "",
      lastName: invitation.lastName ?? "",
      roleIds: invitation.roleIds,
      employeeId: invitation.employeeId ?? null,
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Invitation", entityId: invitation.id,
      metadata: { action: "resend", ok: invite.ok },
    });

    return successResponse({
      id: invitation.id,
      emailSent: invite.ok,
      emailError: invite.ok ? undefined : invite.error,
    });
  } catch (error) {
    console.error("POST /invitations/:id/resend error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.user.invite"],
  rateLimit: { max: 10, windowSec: 5 * 60, by: "user", scope: "invitations.resend" },
});
