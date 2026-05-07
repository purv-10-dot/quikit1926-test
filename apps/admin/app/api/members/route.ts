import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import { inviteMemberSchema } from "@/lib/schemas/memberSchema";
import { writeAuditLog } from "@/lib/audit";
import {
  DEFAULT_INVITE_PASSWORD,
  INVITE_METHOD,
  MEMBERSHIP_ROLE_LABELS,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const GET = withAdminAuth(async ({ orgId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  // Pagination
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
  const skip = (page - 1) * limit;

  const [memberships, total] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            lastSignInAt: true,
            userTeams: {
              where: { orgId },
              include: { team: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.orgMember.count({ where: { orgId } }),
  ]);

  const memberData = memberships.map((m) => ({
    id: m.userId,
    membershipId: m.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.role,
    status: m.status,
    teamNames: m.user.userTeams.map((ut) => ut.team.name),
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    invitedAt: m.invitedAt?.toISOString() ?? null,
    acceptedAt: m.acceptedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({
    success: true,
    data: memberData,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = withAdminAuth(async ({ orgId, userId: inviterId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await request.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { firstName, lastName, role, inviteMethod, appIds } = parsed.data;

  // Normalise email to lowercase at the API boundary — the OAuth signIn
  // callback always lowercases the address it receives from Google/Microsoft,
  // so storing a mixed-case copy makes that lookup miss the row.
  const email = parsed.data.email.trim().toLowerCase();

  // FR-SA-004 — for SSO invites, the email must classify as Google or Microsoft.
  // Uses MX-record lookup for custom corporate domains so we don't need a
  // hardcoded allow-list — `Pravin.Sharma@quikit.ai` resolves to Microsoft via
  // its MX records ending in `mail.protection.outlook.com`.
  let ssoProvider: SsoProvider | null = null;
  if (inviteMethod === INVITE_METHOD.SSO) {
    ssoProvider = await classifySsoProviderAsync(email);
    if (!ssoProvider) {
      return NextResponse.json(
        { success: false, error: "SSO invitations require a Google or Microsoft email address." },
        { status: 422 }
      );
    }
  }

  // Tenant lookup is needed for domain allowlist check, branding, AND email send.
  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { name: true, logoUrl: true, brandColor: true, allowedEmailDomains: true },
  });

  // Domain allowlist enforcement (empty list = unrestricted).
  if (org?.allowedEmailDomains && org.allowedEmailDomains.length > 0) {
    const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
    const allowed = org.allowedEmailDomains.map((d) => d.toLowerCase());
    if (!allowed.includes(emailDomain)) {
      return NextResponse.json(
        {
          success: false,
          error: `Email domain not allowed for this organisation. Permitted domains: ${allowed.join(", ")}`,
        },
        { status: 422 }
      );
    }
  }

  // FR-OA-002 — when inviting an App Admin, every selected appId must
  // actually be provisioned for this org (OrgAppAccess.enabled). Reject
  // anything that's not on the org's allowed list to prevent admins from
  // smuggling access to apps they don't own.
  if (appIds.length > 0) {
    const provisioned = await db.orgAppAccess.findMany({
      where: { orgId, appId: { in: appIds }, enabled: true },
      select: { appId: true },
    });
    const provisionedIds = new Set(provisioned.map((p) => p.appId));
    const missing = appIds.filter((id) => !provisionedIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more selected applications are not available to this organisation.",
        },
        { status: 422 }
      );
    }
  }

  // BRV-010 — duplicate-invite guard. We respond with the same generic success
  // payload to defeat email enumeration but log the duplicate so a real admin
  // can notice. (Form-level uniqueness is also enforced by the UI.)
  let user = await db.user.findUnique({ where: { email } });

  if (user) {
    const existingMembership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });

    if (existingMembership && (existingMembership.status === "active" || existingMembership.status === "invited")) {
      await writeAuditLog({
        orgId,
        actorId: inviterId,
        action: "DUPLICATE_INVITE",
        entityType: "Membership",
        entityId: existingMembership.id,
        reason: `status=${existingMembership.status}`,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${email}`,
      });
    }
  }

  const invitationToken = crypto.randomUUID();

  // Create user if they don't exist. For native invites, seed the system
  // default password (FRD BR-004) and flag the User so the first login
  // routes through the Set-Password screen (FR-SA-009 / BR-008). SSO users
  // never get a password — they authenticate via OAuth.
  if (!user) {
    const isNative = inviteMethod === INVITE_METHOD.NATIVE;
    user = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: isNative ? await bcrypt.hash(DEFAULT_INVITE_PASSWORD, 10) : null,
        mustChangePassword: isNative,
      },
    });
  }

  // Resolve app names for the email body (FRD §4 — every invite lists apps).
  let appNames: string[] = [];
  if (appIds.length > 0) {
    const apps = await db.app.findMany({
      where: { id: { in: appIds } },
      select: { name: true },
    });
    appNames = apps.map((a) => a.name);
  }

  // Create or upsert the membership. Persist FRD-required fields (inviteMethod,
  // inviteProvider, inviteAppIds) so accept-time grants are scoped correctly.
  const membership = await db.orgMember.upsert({
    where: { orgId_userId: { orgId, userId: user.id } },
    create: {
      orgId,
      userId: user.id,
      role,
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      inviteMethod,
      inviteProvider: ssoProvider,
      inviteAppIds: appIds,
      createdBy: inviterId,
    },
    update: {
      role,
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      inviteMethod,
      inviteProvider: ssoProvider,
      inviteAppIds: appIds,
      createdBy: inviterId,
    },
  });

  // Get inviter name for email
  const inviter = await db.user.findUnique({
    where: { id: inviterId },
    select: { firstName: true, lastName: true },
  });

  // FR-SA-005 / FR-SA-008 — branch on inviteMethod inside the email service.
  const roleLabel =
    MEMBERSHIP_ROLE_LABELS[role as keyof typeof MEMBERSHIP_ROLE_LABELS] ||
    ROLE_LABELS[role] ||
    role;
  const sendResult = await sendInvitationEmail({
    to: email,
    firstName,
    orgName: org?.name || "Organisation",
    orgLogoUrl: org?.logoUrl ?? null,
    orgBrandColor: org?.brandColor ?? null,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "An admin",
    role: roleLabel,
    appNames,
    token: invitationToken,
    inviteMethod,
    ssoProvider,
  });

  // FRD §8 Auditability — log the membership creation AND the email lifecycle
  // separately so the admin dashboard can show "invited at X / email sent on
  // attempt 2 / delivery failed on attempt 3" without scraping logs.
  const ipAddress = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");
  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: "INVITED",
    entityType: "Membership",
    entityId: membership.id,
    newValues: { email, role, firstName, lastName, inviteMethod, ssoProvider, appIds },
    ipAddress,
    userAgent,
  });
  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: sendResult.success ? "INVITE_EMAIL_SENT" : "INVITE_EMAIL_FAILED",
    entityType: "Membership",
    entityId: membership.id,
    newValues: {
      to: email,
      attempts: sendResult.attempts,
      error: sendResult.success ? undefined : String(sendResult.error ?? "unknown"),
    },
    ipAddress,
    userAgent,
  });

  // FRD §7 — when delivery fails after all retries, surface a warning so the
  // UI can prompt "email could not be delivered, use Resend Invite to retry"
  // instead of pretending success.
  if (!sendResult.success) {
    return NextResponse.json({
      success: true,
      message: `Invitation created for ${email}, but the email could not be delivered. Use Resend Invite to retry.`,
      warning: "email_delivery_failed",
    });
  }

  return NextResponse.json({
    success: true,
    message: `Invitation sent to ${email}`,
  });
});
