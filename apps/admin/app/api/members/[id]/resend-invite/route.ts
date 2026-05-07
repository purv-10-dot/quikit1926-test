import { NextResponse, NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import { writeAuditLog } from "@/lib/audit";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLE_LABELS,
  type InviteMethod,
  type SsoProvider,
} from "@quikit/shared";
import crypto from "crypto";

export const POST = withAdminAuth<{ id: string }>(async ({ orgId, userId: inviterId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;
  const membershipId = params.id;

  const membership = await db.orgMember.findFirst({
    where: { id: membershipId, orgId, status: "invited" },
    include: { user: { select: { email: true, firstName: true } } },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "No pending invitation found" },
      { status: 404 }
    );
  }

  const newToken = crypto.randomUUID();

  await db.orgMember.update({
    where: { id: membershipId },
    data: {
      invitationToken: newToken,
      invitedAt: new Date(),
    },
  });

  const [org, inviter] = await Promise.all([
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true, brandColor: true },
    }),
    db.user.findUnique({ where: { id: inviterId }, select: { firstName: true, lastName: true } }),
  ]);

  // Resolve app names for the email body — same as fresh invite.
  let appNames: string[] = [];
  if (membership.inviteAppIds && membership.inviteAppIds.length > 0) {
    const apps = await db.app.findMany({
      where: { id: { in: membership.inviteAppIds } },
      select: { name: true },
    });
    appNames = apps.map((a) => a.name);
  }

  // Default to native if the row was created before inviteMethod existed —
  // legacy rows have null and used to send a generic invitation email.
  const inviteMethod: InviteMethod =
    (membership.inviteMethod as InviteMethod | null) ?? INVITE_METHOD.NATIVE;
  const ssoProvider = (membership.inviteProvider as SsoProvider | null) ?? null;

  const roleLabel =
    MEMBERSHIP_ROLE_LABELS[membership.role as keyof typeof MEMBERSHIP_ROLE_LABELS] ||
    ROLE_LABELS[membership.role] ||
    membership.role;

  const sendResult = await sendInvitationEmail({
    to: membership.user.email,
    firstName: membership.user.firstName,
    orgName: org?.name || "Organisation",
    orgLogoUrl: org?.logoUrl ?? null,
    orgBrandColor: org?.brandColor ?? null,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "An admin",
    role: roleLabel,
    appNames,
    token: newToken,
    inviteMethod,
    ssoProvider,
    isReminder: true,
  });

  const ipAddress = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");
  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: "RESENT",
    entityType: "Membership",
    entityId: membershipId,
    ipAddress,
    userAgent,
  });
  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: sendResult.success ? "INVITE_EMAIL_SENT" : "INVITE_EMAIL_FAILED",
    entityType: "Membership",
    entityId: membershipId,
    newValues: {
      to: membership.user.email,
      attempts: sendResult.attempts,
      error: sendResult.success ? undefined : String(sendResult.error ?? "unknown"),
    },
    ipAddress,
    userAgent,
  });

  if (!sendResult.success) {
    return NextResponse.json({
      success: true,
      message: `Invitation token regenerated, but the email could not be delivered.`,
      warning: "email_delivery_failed",
    });
  }

  return NextResponse.json({
    success: true,
    message: `Invitation resent to ${membership.user.email}`,
  });
});
