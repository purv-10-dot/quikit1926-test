import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateInviteToken, inviteExpiry } from "@/lib/auth/invite-token";
import { resolveAndSend } from "@/lib/email/resolve";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
  renderInvitationEmail,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";

/** App slug HRMS is registered under in the central QuikIT app registry. */
const QUIKHRMS_APP_SLUG = "quikhrms";

export interface CentralInviteResult {
  /** Central account + membership + app access created and invite email sent. */
  ok: boolean;
  userId?: string;
  isNewUser?: boolean;
  invitationToken?: string | null;
  tempPassword?: string | null;
  error?: string;
}

/**
 * Central-first invite — written DIRECTLY against the shared central DB, exactly
 * like QuikScale's `app/api/org/users` flow (no HTTP hop to a provisioning
 * endpoint; HRMS shares the same `@quikit/database` client and central schema).
 *
 * Effect (idempotent):
 *   1. Central `User` — created if new (native → bcrypt temp password +
 *      mustChangePassword so the Set-Password screen fires on first login).
 *   2. Central `OrgMember` — active membership (role "member") + single-use
 *      invitation token.
 *   3. Central `UserAppAccess` — grants the person QuikHRMS access.
 *   4. Onboarding invite email — sent by HRMS via the shared template
 *      (`renderInvitationEmail`) carrying the set-up link + temp password.
 *   5. Local HRMS `Invitation` row — for the Users & Invitations list.
 */
export async function provisionCentralInvite(args: {
  orgId: string;
  invitedBy: string;
  email: string;
  firstName: string;
  lastName: string;
  roleIds?: string[];
  employeeId?: string | null;
  invitationMethod?: string;
  departmentId?: string | null;
  designationId?: string | null;
  managerId?: string | null;
}): Promise<CentralInviteResult> {
  const email = args.email.trim().toLowerCase();
  const firstName = args.firstName?.trim() || email.split("@")[0];
  const lastName = args.lastName?.trim() || "-";

  try {
    // 0) The quikhrms app must exist centrally and be enabled for the org.
    const app = await prisma.app.findFirst({ where: { slug: QUIKHRMS_APP_SLUG }, select: { id: true, name: true } });
    if (!app) return { ok: false, error: "QuikHRMS app is not registered centrally." };
    const orgApp = await prisma.orgAppAccess.findFirst({
      where: { orgId: args.orgId, appId: app.id, enabled: true },
      select: { appId: true },
    });
    if (!orgApp) return { ok: false, error: "QuikHRMS is not provisioned for this organisation." };

    // SSO only when the email genuinely classifies as a supported provider;
    // otherwise fall back to native (temp password) so onboarding never
    // dead-ends on a non-Google/Microsoft address.
    let ssoProvider: SsoProvider | null = null;
    let method: (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD] = INVITE_METHOD.NATIVE;
    if (args.invitationMethod === INVITE_METHOD.SSO) {
      ssoProvider = await classifySsoProviderAsync(email);
      if (ssoProvider) method = INVITE_METHOD.SSO;
    }
    const isSso = method === INVITE_METHOD.SSO;

    // 1) Central User — create if new; seed a temp password for native.
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true, password: true } });
    let isNewUser = false;
    let tempPassword: string | null = null;
    if (!user) {
      if (!isSso) tempPassword = generateTempPassword();
      user = await prisma.user.create({
        data: {
          firstName, lastName, email,
          password: !isSso && tempPassword ? await bcrypt.hash(tempPassword, 12) : null,
          mustChangePassword: !isSso,
        },
        select: { id: true, password: true },
      });
      isNewUser = true;
    } else if (!isSso && !user.password) {
      tempPassword = generateTempPassword();
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(tempPassword, 12), mustChangePassword: true },
      });
    }

    // 2) Central OrgMember — active membership + single-use token.
    const invitationToken = crypto.randomUUID();
    await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId: args.orgId, userId: user.id } },
      create: {
        orgId: args.orgId, userId: user.id, role: MEMBERSHIP_ROLES.MEMBER, status: "active",
        invitationToken, invitedAt: new Date(), inviteMethod: method, inviteProvider: ssoProvider,
        createdBy: args.invitedBy,
      },
      update: { status: "active", invitationToken, inviteMethod: method, inviteProvider: ssoProvider },
    });

    // 3) Central UserAppAccess — grant QuikHRMS access (idempotent).
    const hasAccess = await prisma.userAppAccess.findFirst({
      where: { orgId: args.orgId, appId: app.id, userId: user.id }, select: { id: true },
    });
    if (!hasAccess) {
      await prisma.userAppAccess.create({
        data: { userId: user.id, orgId: args.orgId, appId: app.id, role: "member", grantedBy: args.invitedBy },
      });
    }

    // 3b) Link the HRMS Employee → central User now (not lazily on first login).
    // `updateMany` with authUserId: null makes it idempotent and never
    // re-points an employee already bound to another identity.
    if (args.employeeId) {
      await prisma.employee.updateMany({
        where: { id: args.employeeId, orgId: args.orgId, authUserId: null },
        data: { authUserId: user.id },
      });
    }

    // 4) Send the onboarding invite email (HRMS transport + shared template).
    try {
      const org = await prisma.org.findUnique({ where: { id: args.orgId }, select: { name: true, brandColor: true } });
      const appBaseUrl = process.env.NEXT_PUBLIC_QUIKIT_URL ?? process.env.QUIKIT_URL ?? "http://localhost:3000";
      const inviteInput = {
        to: email,
        firstName,
        orgName: org?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: org?.brandColor ?? null,
        inviterName: `${org?.name ?? "QuikIT"} HR`,
        role: "Member",
        appNames: [app.name],
        token: invitationToken,
        appBaseUrl,
        inviteMethod: method,
        ssoProvider,
        tempPassword: tempPassword ?? "",
      };
      await resolveAndSend(args.orgId, {
        key: "employee.invite",
        to: email,
        vars: {
          firstName,
          orgName: inviteInput.orgName,
          inviterName: inviteInput.inviterName,
          role: inviteInput.role,
          inviteUrl: `${appBaseUrl}/invitations/accept?token=${invitationToken}`,
          companyName: inviteInput.orgName,
        },
        fallback: () => renderInvitationEmail(inviteInput),
      });
    } catch (mailErr) {
      console.error("[central-invite] onboarding email failed:", email, mailErr);
    }

    // 5) Local HRMS Invitation row for the Users & Invitations list.
    const expiresAt = inviteExpiry();
    const existing = await prisma.invitation.findFirst({
      where: { orgId: args.orgId, deletedAt: null, status: "Pending", email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      await prisma.invitation.update({
        where: { id: existing.id },
        data: {
          centralInviteToken: invitationToken, expiresAt, invitedBy: args.invitedBy,
          ...(args.employeeId ? { employeeId: args.employeeId } : {}),
          ...(args.roleIds ? { roleIds: args.roleIds } : {}),
        },
      });
    } else {
      await prisma.invitation.create({
        data: {
          orgId: args.orgId, email, firstName, lastName,
          roleIds: args.roleIds ?? [],
          departmentId: args.departmentId ?? null,
          designationId: args.designationId ?? null,
          managerId: args.managerId ?? null,
          token: generateInviteToken().hash,
          centralInviteToken: invitationToken,
          expiresAt, status: "Pending", invitedBy: args.invitedBy,
          ...(args.employeeId ? { employeeId: args.employeeId } : {}),
        },
      });
    }

    return { ok: true, userId: user.id, isNewUser, invitationToken, tempPassword };
  } catch (err) {
    console.error("[central-invite] failed:", email, err);
    return { ok: false, error: err instanceof Error ? err.message : "Central invite failed" };
  }
}
