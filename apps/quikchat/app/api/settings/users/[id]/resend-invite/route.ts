import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { renderInvitationEmail } from "@quikit/shared";
import { db } from "@/lib/db";
import { logger } from "@/lib/shared";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { getQuikChatAppId } from "@/lib/authz/permissions";
import { sendMail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

// Matches the 7-day expiry enforced by the central `/api/invitations/accept` route.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_URL ??
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    "http://localhost:3000"
  );
}

// POST /api/settings/users/:id/resend-invite — rotate the invite token and re-send the email.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId, userId: inviterId } = gate;

  try {
    const appId = await getQuikChatAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikChat app not registered" },
        { status: 500 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const access = await db.userAppAccess.findFirst({
      where: { orgId, userId: user.id, appId },
      select: { id: true },
    });
    if (!access) {
      return NextResponse.json(
        { success: false, error: "User does not have QuikChat access in this organisation" },
        { status: 404 },
      );
    }

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
      select: { acceptedAt: true, inviteMethod: true, inviteProvider: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "User is not a member of this organisation" },
        { status: 404 },
      );
    }
    if (member.acceptedAt) {
      return NextResponse.json(
        { success: false, error: "This user has already accepted their invite" },
        { status: 409 },
      );
    }

    const invitationToken = randomUUID();
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: user.id } },
      data: { invitationToken, invitedAt: new Date() },
    });

    const appBaseUrl = inviteBaseUrl();
    const inviteUrl = `${appBaseUrl}/invitations/accept?token=${invitationToken}`;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

    const userAppRole = await db.qcUserAppRole.findFirst({
      where: { orgId, userId: user.id, role: { appId } },
      select: { role: { select: { name: true } } },
    });
    const roleName = userAppRole?.role?.name ?? "Member";

    let mailSent = false;
    let mailError: string | undefined;
    try {
      const [orgRow, inviterRow, appRow] = await Promise.all([
        db.org.findUnique({ where: { id: orgId }, select: { name: true, brandColor: true } }),
        db.user.findUnique({ where: { id: inviterId }, select: { firstName: true, lastName: true } }),
        db.app.findUnique({ where: { id: appId }, select: { name: true } }),
      ]);

      const firstName = user.firstName?.trim() || user.email.split("@")[0] || "there";
      const inviteMethod: "native" | "sso" = member.inviteMethod === "sso" ? "sso" : "native";
      const ssoProvider: "google" | "microsoft" | null =
        member.inviteProvider === "google" || member.inviteProvider === "microsoft"
          ? member.inviteProvider
          : null;

      const { subject, html } = renderInvitationEmail({
        to: user.email,
        firstName,
        orgName: orgRow?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: orgRow?.brandColor ?? null,
        inviterName: inviterRow
          ? `${inviterRow.firstName} ${inviterRow.lastName}`.trim() || "QuikChat Admin"
          : "QuikChat Admin",
        role: roleName,
        appNames: [appRow?.name ?? "QuikChat"],
        token: invitationToken,
        appBaseUrl,
        inviteMethod,
        ssoProvider,
        isReminder: true,
      });

      const result = await sendMail({ to: user.email, subject, html });
      mailSent = result.success;
      if (!result.success) mailError = result.error;
    } catch (e: unknown) {
      mailError = e instanceof Error ? e.message : String(e);
      logger.warn({ msg: "resend_invite_mail_send_failed", email: user.email, error: mailError });
    }

    return NextResponse.json({
      success: true,
      data: {
        invite: {
          url: inviteUrl,
          expiresAt,
          mail: { sent: mailSent, error: mailError ?? null },
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to resend invite";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
