import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { generateInviteToken, inviteExpiry } from "@/lib/auth/invite-token";
import { dispatchInvitationEmail } from "@/lib/services/invitation";
import { createAuditLog } from "@/lib/utils/audit";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Central QuikIT base — hosts the /invitations/accept set-password flow. */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "";

/** POST /api/v1/hrms/invitations/:id/resend — issue a fresh token + re-email. */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const invitation = await prisma.invitation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!invitation) return notFound("Invitation not found");
    if (invitation.status === "Accepted") return conflict("Invitation already accepted");

    // Refresh the token hash + expiry so the list's Pending/Expired display
    // resets; the token is not emailed (login is SSO).
    const { hash } = generateInviteToken();
    const expiresAt = inviteExpiry();

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { token: hash, expiresAt, status: "Pending" },
    });

    const inviter = await prisma.employee.findFirst({
      where: { id: userId, orgId },
      select: { firstName: true, lastName: true },
    });

    // Rebuild the same central accept link the first invite carried (brand-new
    // native users only). The central token lives on the still-pending OrgMember
    // and is valid until its own 7-day TTL; existing/SSO invites have none, so
    // they keep falling back to the login redirect.
    const setupUrl =
      invitation.centralInviteToken && QUIKIT_URL
        ? `${QUIKIT_URL.replace(/\/$/, "")}/invitations/accept?token=${encodeURIComponent(invitation.centralInviteToken)}`
        : null;

    const mail = await dispatchInvitationEmail({
      orgId,
      to: invitation.email,
      inviteeName: `${invitation.firstName ?? ""} ${invitation.lastName ?? ""}`.trim() || invitation.email,
      loginUrl: `${req.nextUrl.origin}${BASE_PATH}/login`,
      setupUrl,
      expiresAt,
      inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null,
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Invitation", entityId: invitation.id,
      metadata: { action: "resend", emailQueued: mail.queued, emailSent: mail.sent },
    });

    return successResponse({ id: invitation.id, expiresAt, emailSent: mail.queued || mail.sent, emailError: mail.error });
  } catch (error) {
    console.error("POST /invitations/:id/resend error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.user.invite"],
  rateLimit: { max: 10, windowSec: 5 * 60, by: "user", scope: "invitations.resend" },
});
