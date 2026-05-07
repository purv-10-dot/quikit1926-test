import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";
import { passwordPolicyError } from "@/lib/passwordPolicy";
import {
  DEFAULT_INVITE_PASSWORD,
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
} from "@quikit/shared";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      org: { select: { name: true, logoUrl: true, brandColor: true } },
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

  // FRD BRV-009 — 7-day expiry from invitedAt.
  if (membership.invitedAt && Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orgName: membership.org.name,
      orgLogo: membership.org.logoUrl,
      orgColor: membership.org.brandColor,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      role: membership.role,
      // Native invites land on the Set-Password screen (FR-SA-009). SSO
      // invites bypass it entirely — the auth provider does the credential
      // exchange.
      inviteMethod: membership.inviteMethod,
      // FR-SA-009 — for native invites we always show the Set-Password
      // screen on first accept, regardless of whether the User row already
      // has the seeded default password set.
      needsPassword:
        membership.inviteMethod === INVITE_METHOD.NATIVE || !membership.user.password,
    },
  });
}

interface AcceptBody {
  token?: string;
  /** Native flow only — required if `skip` is false. */
  password?: string;
  /** FR-SA-009 — when true, keep DEFAULT_INVITE_PASSWORD and proceed. */
  skip?: boolean;
  /** FR-SA-009 — current password the user entered ("Quikit2026" by default). */
  currentPassword?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AcceptBody;
  const { token, password, skip, currentPassword } = body;

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      user: { select: { id: true, password: true, email: true } },
    },
  });

  if (!membership || membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invalid or already accepted invitation" },
      { status: 400 }
    );
  }

  // FRD BRV-009 — 7-day expiry from invitedAt.
  if (membership.invitedAt && Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 }
    );
  }

  const inviteMethod = membership.inviteMethod ?? INVITE_METHOD.NATIVE;

  // ── Native flow: Set-Password screen handling (FR-SA-009 / FR-SA-010) ─────
  if (inviteMethod === INVITE_METHOD.NATIVE) {
    // BRV-008 — current password must match the system default the user was
    // issued in the invite email. (Once they set a real password, this same
    // route is never re-entered — invitationToken is cleared on accept.)
    if (currentPassword && currentPassword !== DEFAULT_INVITE_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Incorrect password. Please enter your default password to proceed." },
        { status: 400 }
      );
    }

    if (skip) {
      // FR-SA-009 — Skip keeps the default password in place. We DO clear
      // mustChangePassword (BR-008: screen shown only once) so subsequent
      // logins go straight to the dashboard. The user remains on Quikit2026
      // until they hit Forgot Password or change it from settings.
      await db.user.update({
        where: { id: membership.user.id },
        data: { mustChangePassword: false },
      });
    } else {
      // BRV-006 / BRV-007 — validate new password, must match confirm field
      // (the UI sends a single `password` after client-side equality check).
      const pwErr = passwordPolicyError(password);
      if (pwErr) {
        return NextResponse.json({ success: false, error: pwErr }, { status: 400 });
      }
      const hashed = await bcrypt.hash(password as string, 10);
      await db.user.update({
        where: { id: membership.user.id },
        data: { password: hashed, mustChangePassword: false },
      });
    }
  }

  // Activate membership.
  await db.orgMember.update({
    where: { id: membership.id },
    data: {
      status: "active",
      acceptedAt: new Date(),
      invitationToken: null,
    },
  });

  await writeAuditLog({
    orgId: membership.orgId,
    actorId: membership.user.id,
    action: "ACCEPTED",
    entityType: "Membership",
    entityId: membership.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  // ── App access grants (FR-SA-002 / FR-OA-002) ─────────────────────────────
  // Replaces the legacy "auto-grant all active apps" behaviour. We grant only
  // the apps the inviter explicitly selected on the invite form. Empty list
  // is valid for plain Users (FR-OA-003) — they may be assigned apps later.
  const grantAppIds = membership.inviteAppIds ?? [];
  if (grantAppIds.length > 0) {
    // App Admin role on the membership maps to "admin" role on each
    // UserAppAccess row, scoping admin rights to the assigned apps only
    // (FR-OA-002: "the App Admin will only see and manage the applications
    // they have been assigned to"). Other roles get "member".
    const userAppRole =
      membership.role === MEMBERSHIP_ROLES.APP_ADMIN ? "admin" : "member";

    await db.userAppAccess.createMany({
      data: grantAppIds.map((appId) => ({
        userId: membership.user.id,
        orgId: membership.orgId,
        appId,
        role: userAppRole,
        grantedBy: membership.createdBy,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    success: true,
    message: "Invitation accepted successfully",
    data: {
      inviteMethod,
      // The UI uses this to decide where to redirect: native goes to /login
      // (FR-SA-010), SSO redirects to dashboard via the OAuth provider.
      nextStep: inviteMethod === INVITE_METHOD.NATIVE ? "login" : "dashboard",
    },
  });
}
