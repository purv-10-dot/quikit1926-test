import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const membership = await db.membership.findUnique({
    where: { invitationToken: token },
    include: {
      tenant: { select: { name: true, logoUrl: true, brandColor: true } },
      user: { select: { email: true, firstName: true, lastName: true, password: true } },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired invitation" },
      { status: 404 }
    );
  }

  if (membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invitation already accepted" },
      { status: 400 }
    );
  }

  // Check token expiry (7 days from invitedAt)
  const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  if (membership.invitedAt && Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orgName: membership.tenant.name,
      orgLogo: membership.tenant.logoUrl,
      orgColor: membership.tenant.brandColor,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      role: membership.role,
      needsPassword: !membership.user.password,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, password } = body;

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const membership = await db.membership.findUnique({
    where: { invitationToken: token },
    include: {
      user: { select: { id: true, password: true } },
    },
  });

  if (!membership || membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invalid or already accepted invitation" },
      { status: 400 }
    );
  }

  // Check token expiry (7 days from invitedAt)
  const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  if (membership.invitedAt && Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 }
    );
  }

  // If user needs a password, validate and set it
  if (!membership.user.password) {
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password is required and must be at least 8 characters" },
        { status: 400 }
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: membership.user.id },
      data: { password: hashedPassword },
    });
  }

  // Activate membership
  await db.membership.update({
    where: { id: membership.id },
    data: {
      status: "active",
      acceptedAt: new Date(),
      invitationToken: null,
    },
  });

  // Auto-grant access to all active apps
  const activeApps = await db.app.findMany({
    where: { status: "active" },
  });

  if (activeApps.length > 0) {
    await db.userAppAccess.createMany({
      data: activeApps.map((app) => ({
        userId: membership.user.id,
        tenantId: membership.tenantId,
        appId: app.id,
        role: "member",
        grantedBy: membership.createdBy,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    success: true,
    message: "Invitation accepted successfully",
  });
}
