import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  DEFAULT_INVITE_PASSWORD,
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
} from "@quikit/shared";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Native-invite acceptance API hosted on the central auth service so the
 * "Set Up My Account" link in onboarding emails (which points at
 * `${NEXT_PUBLIC_AUTH_URL}/invitations/accept?token=…`) opens directly on
 * the Set-Password screen instead of bouncing to /login.
 *
 *   GET  ?token=…  → token validity + display data for the form
 *   POST           → either set a new password (Save & Continue)
 *                    or keep the system default (Skip)
 *
 * Both verbs are public — the single-use invitationToken is the auth
 * factor. Hardened with a 7-day TTL (FRD BRV-009) and a one-shot
 * activation guard (already-active memberships are rejected so a leaked
 * link can't be replayed once the user is in).
 */

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 },
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      org: { select: { name: true, logoUrl: true, brandColor: true } },
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired invitation" },
      { status: 404 },
    );
  }

  if (membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invitation already accepted. Please sign in." },
      { status: 400 },
    );
  }

  if (
    membership.invitedAt &&
    Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "This invitation has expired. Please ask the admin to resend it.",
      },
      { status: 410 },
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
      inviteMethod: membership.inviteMethod,
    },
  });
}

interface AcceptBody {
  token?: string;
  skip?: boolean;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export async function POST(request: NextRequest) {
  let body: AcceptBody = {};
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }

  const { token, skip, currentPassword, newPassword, confirmPassword } = body;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 },
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      user: { select: { id: true, email: true, password: true } },
    },
  });

  if (!membership || membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invalid or already accepted invitation" },
      { status: 400 },
    );
  }

  if (
    membership.invitedAt &&
    Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "This invitation has expired. Please ask the admin to resend it.",
      },
      { status: 410 },
    );
  }

  const inviteMethod = membership.inviteMethod ?? INVITE_METHOD.NATIVE;

  // Native flow: branch on Skip vs Save.
  if (inviteMethod === INVITE_METHOD.NATIVE) {
    if (skip) {
      // Keep the system default password. Just clear the must-change flag so
      // the user isn't routed back to /set-password on next sign-in.
      await db.user.update({
        where: { id: membership.user.id },
        data: { mustChangePassword: false },
      });
    } else {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return NextResponse.json(
          { success: false, error: "All password fields are required." },
          { status: 400 },
        );
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json(
          {
            success: false,
            error: "Passwords do not match. Please re-enter.",
          },
          { status: 400 },
        );
      }

      // BRV-008 — current password must match what's stored. For a freshly
      // invited user that's the system default; for someone retrying after
      // a previous reset attempt, it's whatever they last set.
      if (!membership.user.password) {
        return NextResponse.json(
          {
            success: false,
            error: "Account has no password set. Use Forgot Password.",
          },
          { status: 400 },
        );
      }
      const okCurrent = await bcrypt.compare(
        currentPassword,
        membership.user.password,
      );
      if (!okCurrent) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Incorrect password. Please enter your default password to proceed.",
          },
          { status: 400 },
        );
      }

      const policyError = checkPasswordPolicy(newPassword);
      if (policyError) {
        return NextResponse.json(
          { success: false, error: policyError },
          { status: 400 },
        );
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await db.user.update({
        where: { id: membership.user.id },
        data: { password: hashed, mustChangePassword: false },
      });
    }
  }

  // Activate the membership and clear the single-use token (FR-SA-006).
  await db.orgMember.update({
    where: { id: membership.id },
    data: {
      status: "active",
      acceptedAt: new Date(),
      invitationToken: null,
    },
  });

  // Grant the apps the inviter selected (FR-SA-002 / FR-OA-002).
  const grantAppIds = membership.inviteAppIds ?? [];
  if (grantAppIds.length > 0) {
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
    data: {
      email: membership.user.email,
      // Tells the client whether to attempt auto-sign-in (Save & Continue)
      // or send the user to /login to enter credentials manually (Skip).
      skipped: Boolean(skip),
    },
  });
}

function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw))
    return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Password must contain at least one special character.";
  if (pw === DEFAULT_INVITE_PASSWORD) {
    return "New password cannot be the same as the default password.";
  }
  return null;
}
