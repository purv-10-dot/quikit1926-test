import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { renderInvitationEmail } from "@quikit/shared";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { assignAppRoles } from "@quikit/auth/assign-app-roles";
import { db } from "@/lib/db";
import { logger } from "@/lib/shared";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { getQuikChatAppId } from "@/lib/authz/permissions";
import { seedAllDefaultRoles } from "@/lib/authz/seed";
import { sendMail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

/**
 * Invite-a-new-person flow for QuikChat, modeled on QuikInfra's
 * `app/api/settings/users/route.ts`. Central identity (auth.User,
 * quikit.OrgMember, quikit.UserAppAccess) is shared platform-wide — this
 * route writes the invite there and mirrors the chosen role into QuikChat's
 * own RBAC v2 tables via the shared `assignAppRoles` helper. Acceptance
 * (set-password / SSO sign-in) is handled entirely by the central auth app's
 * `/invitations/accept` page — nothing to build here for that half.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches the 7-day expiry enforced by the central `/api/invitations/accept`
// route — surfaced here only for the admin UI's "expires in" copy.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_URL ??
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    "http://localhost:3000"
  );
}

// GET /api/settings/users — list org members with QuikChat access (active + pending invites).
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;

  try {
    const appId = await getQuikChatAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikChat app not registered" },
        { status: 500 },
      );
    }

    const access = await db.userAppAccess.findMany({
      where: { orgId, appId },
      select: { userId: true, role: true, grantedAt: true },
    });
    const userIds = access.map((a) => a.userId);
    if (userIds.length === 0) return NextResponse.json({ success: true, data: [] });

    const [members, users, appRoles] = await Promise.all([
      db.orgMember.findMany({
        where: { orgId, userId: { in: userIds } },
        select: {
          userId: true,
          invitedAt: true,
          acceptedAt: true,
          inviteMethod: true,
          inviteProvider: true,
        },
      }),
      db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastSignInAt: true,
        },
      }),
      db.qcUserAppRole.findMany({
        where: { orgId, userId: { in: userIds }, role: { appId } },
        select: { userId: true, role: { select: { name: true } } },
      }),
    ]);

    const memberByUser = new Map(members.map((m) => [m.userId, m]));
    const roleNameByUser = new Map(appRoles.map((r) => [r.userId, r.role.name]));
    const accessByUser = new Map(access.map((a) => [a.userId, a]));

    const data = users
      .map((u) => {
        const member = memberByUser.get(u.id);
        const grantedAt = accessByUser.get(u.id)?.grantedAt ?? null;
        const accepted = !!member?.acceptedAt || !!u.lastSignInAt;
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: roleNameByUser.get(u.id) ?? accessByUser.get(u.id)?.role ?? "Member",
          status: accepted ? "active" : "pending",
          inviteMethod: member?.inviteMethod ?? null,
          invitedAt: (member?.invitedAt ?? grantedAt)?.toISOString() ?? null,
          acceptedAt: member?.acceptedAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => {
        const at = a.invitedAt ? new Date(a.invitedAt).getTime() : 0;
        const bt = b.invitedAt ? new Date(b.invitedAt).getTime() : 0;
        return bt - at;
      });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list users";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/settings/users — invite a new person by email (native password or SSO).
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId, userId: inviterId } = gate;

  try {
    const body = await request.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const roleId = String(body.roleId ?? "").trim();
    const invitationMethod: "native" | "sso" = body.invitationMethod === "sso" ? "sso" : "native";

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { success: false, error: "First name, last name and email are required" },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ success: false, error: "Invalid email address" }, { status: 400 });
    }
    if (!roleId) {
      return NextResponse.json({ success: false, error: "A role is required" }, { status: 400 });
    }

    const appId = await getQuikChatAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikChat app not registered" },
        { status: 500 },
      );
    }

    // Guarantees the org's four default roles exist before the lookup below —
    // closes the gap where a brand-new org's first invite could 400 with
    // "Unknown role" before any authenticated request had lazily seeded them.
    await seedAllDefaultRoles(orgId);
    const role = await db.qcAppRole.findFirst({
      where: { id: roleId, orgId, appId },
      select: { id: true, name: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Unknown role" }, { status: 400 });
    }

    let ssoProvider: "google" | "microsoft" | null = null;
    if (invitationMethod === "sso") {
      const classified = await classifySsoProviderAsync(email).catch(() => null);
      if (classified !== "google" && classified !== "microsoft") {
        return NextResponse.json(
          { success: false, error: "SSO invitations require a Google or Microsoft email address." },
          { status: 422 },
        );
      }
      ssoProvider = classified;
    }

    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
    const existingMembership = existingUser
      ? await db.orgMember.findUnique({
          where: { orgId_userId: { orgId, userId: existingUser.id } },
          select: { id: true, inviteAppIds: true },
        })
      : null;
    if (existingMembership) {
      const existingAccess = await db.userAppAccess.findFirst({
        where: { orgId, userId: existingUser!.id, appId },
        select: { id: true },
      });
      if (existingAccess) {
        return NextResponse.json(
          { success: false, error: `${email} already has QuikChat access in this organisation` },
          { status: 409 },
        );
      }
    }

    // Native invitees get a fresh temp password, bcrypt-hashed into
    // User.password, and forced to change it on first login. SSO invitees
    // stay passwordless — the central OAuth flow handles authentication.
    // An existing central account keeps whatever credential it already has.
    const tempPassword =
      invitationMethod === "native" && !existingUser ? generateTempPassword() : null;
    const hashedTempPassword = tempPassword ? await bcrypt.hash(tempPassword, 12) : null;

    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName,
        lastName,
        password: hashedTempPassword,
        mustChangePassword: invitationMethod === "native",
      },
      select: { id: true },
    });

    const invitationToken = randomUUID();
    const nextInviteAppIds = existingMembership
      ? Array.from(new Set([...(existingMembership.inviteAppIds ?? []), appId]))
      : [appId];

    await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      update: {
        invitationToken,
        invitedAt: new Date(),
        inviteMethod: invitationMethod,
        inviteProvider: ssoProvider,
        inviteAppIds: nextInviteAppIds,
      },
      create: {
        orgId,
        userId: user.id,
        role: "member",
        status: "active",
        createdBy: inviterId,
        invitationToken,
        invitedAt: new Date(),
        inviteMethod: invitationMethod,
        inviteProvider: ssoProvider,
        inviteAppIds: nextInviteAppIds,
      },
    });

    const existingAccessRow = await db.userAppAccess.findFirst({
      where: { orgId, userId: user.id, appId },
      select: { id: true },
    });
    if (!existingAccessRow) {
      await db.userAppAccess.create({
        data: { userId: user.id, orgId, appId, role: role.name, grantedBy: inviterId },
      });
    }

    // Mirrors the chosen role into app_quikchat.UserAppRole + the central
    // UserAppAccess.role denormalisation, replacing any prior QuikChat role.
    await assignAppRoles(db, orgId, [{ userId: user.id, appId, roleName: role.name }]);

    const appBaseUrl = inviteBaseUrl();
    const inviteUrl = `${appBaseUrl}/invitations/accept?token=${invitationToken}`;
    const inviteExpiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

    let mailSent = false;
    let mailError: string | undefined;
    try {
      const [orgRow, inviterRow, appRow] = await Promise.all([
        db.org.findUnique({ where: { id: orgId }, select: { name: true, brandColor: true } }),
        db.user.findUnique({ where: { id: inviterId }, select: { firstName: true, lastName: true } }),
        db.app.findUnique({ where: { id: appId }, select: { name: true } }),
      ]);

      const { subject, html } = renderInvitationEmail({
        to: email,
        firstName,
        orgName: orgRow?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: orgRow?.brandColor ?? null,
        inviterName: inviterRow
          ? `${inviterRow.firstName} ${inviterRow.lastName}`.trim() || "QuikChat Admin"
          : "QuikChat Admin",
        role: role.name,
        appNames: [appRow?.name ?? "QuikChat"],
        token: invitationToken,
        appBaseUrl,
        inviteMethod: invitationMethod,
        ssoProvider,
        tempPassword: tempPassword ?? "",
      });

      const result = await sendMail({ to: email, subject, html });
      mailSent = result.success;
      if (!result.success) mailError = result.error;
    } catch (e: unknown) {
      mailError = e instanceof Error ? e.message : String(e);
      logger.warn({ msg: "invite_mail_send_failed", email, error: mailError });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: user.id,
          email,
          firstName,
          lastName,
          role: role.name,
          invite: {
            url: inviteUrl,
            method: invitationMethod,
            ssoProvider,
            expiresAt: inviteExpiresAt,
            mail: { sent: mailSent, error: mailError ?? null },
            tempPassword: tempPassword ?? undefined,
          },
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to invite user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
