import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tenantId = params.id;

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  if (!tenant) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  const { email, firstName, lastName } = await request.json();

  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { success: false, error: "email, firstName, and lastName are required" },
      { status: 400 }
    );
  }

  // Find or create user
  let user = await db.user.findUnique({ where: { email } });

  if (user) {
    // Check if already has membership for this tenant
    const existing = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });

    if (existing && existing.status === "active") {
      return NextResponse.json(
        { success: false, error: "User is already an active member of this organisation" },
        { status: 409 }
      );
    }
  }

  if (!user) {
    user = await db.user.create({
      data: { email, firstName, lastName },
    });
  }

  const invitationToken = crypto.randomUUID();

  await db.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: {
      tenantId,
      userId: user.id,
      role: "admin",
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      createdBy: auth.userId,
    },
    update: {
      role: "admin",
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      createdBy: auth.userId,
    },
  });

  // Get inviter name
  const inviter = await db.user.findUnique({
    where: { id: auth.userId },
    select: { firstName: true, lastName: true },
  });

  await sendInvitationEmail({
    to: email,
    orgName: tenant.name,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "Platform Admin",
    role: "Admin",
    token: invitationToken,
  });

  return NextResponse.json({
    success: true,
    message: `Admin invitation sent to ${email}`,
  });
}
