import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId, userId: inviterId } = auth;
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId, status: "invited" },
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
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.user.findUnique({ where: { id: inviterId }, select: { firstName: true, lastName: true } }),
  ]);

  await sendInvitationEmail({
    to: membership.user.email,
    orgName: tenant?.name || "Organisation",
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "An admin",
    role: ROLE_LABELS[membership.role] || membership.role,
    token: newToken,
  });

  return NextResponse.json({
    success: true,
    message: `Invitation resent to ${membership.user.email}`,
  });
}
