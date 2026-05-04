import { NextResponse, NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import { writeAuditLog } from "@/lib/audit";
import crypto from "crypto";

export const POST = withAdminAuth<{ id: string }>(async ({ orgId, userId: inviterId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, orgId, status: "invited" },
    include: { user: { select: { email: true } } },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "No pending invitation found" },
      { status: 404 }
    );
  }

  const newToken = crypto.randomUUID();

  await db.membership.update({
    where: { id: membershipId },
    data: {
      invitationToken: newToken,
      invitedAt: new Date(),
    },
  });

  const [tenant, inviter] = await Promise.all([
    db.tenant.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true, brandColor: true },
    }),
    db.user.findUnique({ where: { id: inviterId }, select: { firstName: true, lastName: true } }),
  ]);

  await sendInvitationEmail({
    to: membership.user.email,
    orgName: tenant?.name || "Organisation",
    orgLogoUrl: tenant?.logoUrl ?? null,
    orgBrandColor: tenant?.brandColor ?? null,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "An admin",
    role: ROLE_LABELS[membership.role] || membership.role,
    token: newToken,
    isReminder: true,
  });

  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: "RESENT",
    entityType: "Membership",
    entityId: membershipId,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    success: true,
    message: `Invitation resent to ${membership.user.email}`,
  });
});
