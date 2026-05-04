import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const REQUEST_THROTTLE_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token: string | undefined = body?.token;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      org: { select: { name: true } },
    },
  });

  const generic = NextResponse.json({
    success: true,
    message:
      "Your request has been sent. An administrator will resend the invitation shortly.",
  });

  if (!membership || membership.status !== "invited" || !membership.createdBy) {
    return generic;
  }

  const recent = await db.notification.findFirst({
    where: {
      userId: membership.createdBy,
      orgId: membership.orgId,
      relatedEntityType: "Membership",
      relatedEntityId: membership.id,
      type: "invitation_resend_requested",
      createdAt: { gte: new Date(Date.now() - REQUEST_THROTTLE_MS) },
    },
    select: { id: true },
  });
  if (recent) return generic;

  const fullName = `${membership.user.firstName} ${membership.user.lastName}`.trim();
  await db.notification.create({
    data: {
      orgId: membership.orgId,
      userId: membership.createdBy,
      title: "Invitation resend requested",
      message: `${fullName} (${membership.user.email}) tried to accept their invitation to ${membership.org.name} but the link has expired. Open Members and click Resend to issue a fresh invite.`,
      type: "invitation_resend_requested",
      relatedEntityId: membership.id,
      relatedEntityType: "Membership",
      channel: "in_app",
    },
  });

  return generic;
}
