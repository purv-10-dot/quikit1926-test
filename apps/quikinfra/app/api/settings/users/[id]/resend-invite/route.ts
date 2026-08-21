import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { renderInvitationEmail } from "@quikit/shared";
import { db } from "@/lib/db";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";
import { sendMail } from "@/lib/email/mailer";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { logger } from "@/lib/observability/logger";

const auth = withOrgAuthForResource("construction.users");

// 72-hour invitation TTL. Stays in sync with the duplicate constants in
// src/lib/users/central-repository.ts + app/api/settings/users/route.ts —
// change all three together if you move the window.
const INVITATION_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * POST /api/settings/users/:id/resend-invite
 *
 * Rotates the central `quikit.OrgMember.invitationToken` and re-dispatches
 * the invitation email. cn_users.inviteToken is no longer touched —
 * Step C of the cn_users decommission moved invite-token state entirely
 * to OrgMember (already dual-written by POST; this route was the last
 * place still writing the legacy column).
 *
 * The `[id]` param is still the cn_users.id (Step E will switch to
 * auth.User.id). We use it to look up the email, then do all the
 * acceptance / token / email work against the central tables.
 *
 * Accepted users cannot have their invite re-issued via this endpoint —
 * we check `OrgMember.acceptedAt`, not the (now stale) cn_users value.
 */
export const POST = auth.manage<{ id: string }>(async (
  authCtx,
  _req: NextRequest,
  { params },
) => {
  const ctx = { orgId: authCtx.orgId, userId: authCtx.userId };

  // Step E: params.id is now auth.User.id (the list/detail endpoints
  // return that as the id). Direct central-table lookup — no cn_users
  // intermediate.
  const authUser = await db.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!authUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Acceptance check via OrgMember (central source). cn_users.acceptedAt
  // is vestigial — the launcher's accept route writes to OrgMember only.
  const orgMember = await db.orgMember.findUnique({
    where: {
      orgId_userId: { orgId: ctx.orgId, userId: authUser.id },
    },
    select: { acceptedAt: true, inviteMethod: true, inviteProvider: true },
  });
  if (!orgMember) {
    return NextResponse.json(
      { error: "User is not a member of this organisation." },
      { status: 404 },
    );
  }
  if (orgMember.acceptedAt) {
    return NextResponse.json(
      { error: "This user has already accepted their invite." },
      { status: 409 },
    );
  }

  // Rotate the central invitation token. This is the ONLY token write
  // left — cn_users.inviteToken / inviteTokenExpires / invitedAt /
  // status are no longer touched by this route.
  const centralInvitationToken = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  try {
    await db.orgMember.update({
      where: {
        orgId_userId: { orgId: ctx.orgId, userId: authUser.id },
      },
      data: {
        invitationToken: centralInvitationToken,
        invitedAt: new Date(),
      },
    });
    logger.info({
      msg: "resend_invite_token_rotated",
      email: authUser.email,
    });
  } catch (e: unknown) {
    logger.warn({
      msg: "resend_invite_token_rotate_failed",
      email: authUser.email,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Failed to rotate the invite token. Try again." },
      { status: 500 },
    );
  }

  // Invite link target — central auth app (apps/auth), NOT the launcher.
  // `/invitations/accept?token=…` lives there.
  //
  // Exception: mobile-enabled users get QuikInfra's own `/invite/{token}`
  // landing page instead, so Android App Links can intercept it (see
  // /.well-known/assetlinks.json). Mirrors the same branch in
  // app/api/settings/users/route.ts's initial-invite path — the flag isn't
  // in the request body here, so it's read from CnUserProfile (org-scoped
  // via the orgId_userId composite key).
  const authBase = (
    process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const quikinfraBase = (
    process.env.NEXT_PUBLIC_QUIKINFRA_URL ?? process.env.QUIKINFRA_URL ?? authBase
  ).replace(/\/$/, "");
  const profile = await db.cnUserProfile.findUnique({
    where: { orgId_userId: { orgId: ctx.orgId, userId: authUser.id } },
    select: { mobileAccessEnabled: true },
  });
  const inviteUrl = profile?.mobileAccessEnabled
    ? `${quikinfraBase}/invite/${centralInvitationToken}`
    : `${authBase}/invitations/accept?token=${centralInvitationToken}`;

  // ── Re-dispatch the invitation email (matches QuikScale pattern) ──
  let mailSent = false;
  let mailError: string | undefined;
  try {
    const appId = await getQuikInfraAppId();
    const [orgRow, inviterRow, appRow] = await Promise.all([
      db.org.findUnique({
        where: { id: ctx.orgId },
        select: { name: true, brandColor: true },
      }),
      db.user.findUnique({
        where: { id: ctx.userId },
        select: { firstName: true, lastName: true },
      }),
      appId
        ? db.app.findUnique({
            where: { id: appId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    // Step E: salutation comes from auth.User.firstName directly.
    // Fall back to the email local-part so it's never blank.
    const firstName =
      (authUser.firstName?.trim() ?? "") ||
      authUser.email.split("@")[0] ||
      "there";

    // Pull the user's v2 role to label the salutation chip ("ADMIN" /
    // "HO_USER" / etc.). Falls back to "User" when no role assignment
    // exists yet (e.g. invitee never logged in).
    const userAppRole = await db.cnUserAppRole.findFirst({
      where: { orgId: ctx.orgId, userId: authUser.id },
      select: { role: { select: { name: true } } },
    });
    const roleName = userAppRole?.role?.name?.toUpperCase() ?? "USER";

    const inviteMethod: "native" | "sso" =
      orgMember.inviteMethod === "sso" ? "sso" : "native";
    const ssoProvider: "google" | "microsoft" | null =
      orgMember.inviteProvider === "google" ||
      orgMember.inviteProvider === "microsoft"
        ? orgMember.inviteProvider
        : null;

    const { subject, html } = renderInvitationEmail({
      to: authUser.email,
      firstName,
      orgName: orgRow?.name ?? "your organisation",
      orgLogoUrl: null,
      orgBrandColor: orgRow?.brandColor ?? null,
      inviterName: inviterRow
        ? `${inviterRow.firstName} ${inviterRow.lastName}`.trim() ||
          "QuikInfra Admin"
        : "QuikInfra Admin",
      role: roleName,
      appNames: [appRow?.name ?? "QuikInfra"],
      token: centralInvitationToken,
      // Email's "Set Up My Account" button must point at the auth app —
      // the launcher's old in-page modal was retired.
      appBaseUrl: authBase,
      inviteMethod,
      ssoProvider,
      isReminder: true,
    });

    const result = await sendMail({ to: authUser.email, subject, html });
    mailSent = result.success;
    if (!result.success) mailError = result.error;

    logger.info({
      msg: "resend_invite_mail_dispatched",
      email: authUser.email,
      success: mailSent,
      error: mailError,
    });
  } catch (e: unknown) {
    mailError = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: "resend_invite_mail_send_failed",
      email: authUser.email,
      error: mailError,
    });
  }

  return NextResponse.json({
    success: true,
    invite: {
      url: inviteUrl,
      expiresAt: expiresAt.toISOString(),
      mail: {
        sent: mailSent,
        error: mailError ?? null,
      },
    },
  });
});
