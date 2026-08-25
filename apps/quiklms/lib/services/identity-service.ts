/**
 * Central identity provisioning — the bridge that makes LMS-created people
 * login-capable. Writes User / OrgMember / UserAppAccess into the platform ORG
 * database (quikit_dev) via the dedicated org client, mirroring the shape of
 * admin's POST /api/members. The caller then creates the LMS row with the SAME
 * id, so on SSO login `session.user.id === LMS User.id` and LMS data resolves.
 *
 * Idempotent: reuses an existing platform User by email; upserts membership +
 * app access. Returns the central userId (used as the LMS row id) and, when a
 * fresh password was seeded, the plaintext temp password to relay to the user.
 */
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  SUBSCRIPTION_STATUS,
  TENANT_PLANS,
  INVITE_METHOD,
  renderInvitationEmail,
  type SsoProvider,
} from '@quikit/shared';
import { generateTempPassword } from '@quikit/shared/temp-password';
import { classifySsoProviderAsync } from '@quikit/shared/sso-domain-server';
import type { LmsUserRole } from '@prisma/client';
import { orgDb, ORG_DB_ENABLED } from '@/lib/org-db';
import { db } from '@/lib/db';
import { ensureUserOnLmsRole, LMS_SYSTEM_ADMIN_ROLE } from '@/lib/api/seed-lms-app-roles';
import { ensureLmsRbacSeeded } from '@/lib/api/seed-lms-permissions';
import { registerUser, type RegisterUserInput } from '@/lib/services/auth-service';
import { BadRequest } from '@/lib/http';
import { sendEmail } from '@/lib/email';
import { roleDisplayNameFor } from '@/lib/email-templates';

const QUIKLMS_SLUG = 'quiklms';

/** The tenant login entry point — SSO handoff bounces through here. */
const LOGIN_URL = `${(process.env.NEXTAUTH_URL || 'http://localhost:3014').replace(/\/$/, '')}/login`;

/**
 * Invitation lifetime. Mirrors INVITATION_TTL_MS in
 * `apps/auth/app/api/invitations/accept/route.ts`, which is the endpoint that
 * actually enforces it (BRV-009) — this constant only stamps `expiresAt` on the
 * local audit row so the list UI can show an accurate state.
 */
const INVITATION_TTL_DAYS = 7;

/**
 * Base URL for the invitation email's links.
 *
 * MUST be the central auth host. `apps/auth/app/api/invitations/accept` is the one
 * place that validates the single-use token, enforces the 7-day TTL, blocks replay
 * against an already-active membership, sets the password and calls
 * `assignAppRoles`. `renderInvitationEmail` appends `/login` and
 * `/invitations/accept?token=…` to whatever it is given, so handing it the LMS
 * origin would produce a login form that cannot accept anything.
 */
function invitationBaseUrl(): string {
  const central = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
  return central || LOGIN_URL.replace(/\/login$/, '');
}

/**
 * Outcome of one invitation dispatch.
 *
 * `sent: false` is NOT an error condition for provisioning — the account is
 * still created — but it MUST reach the caller. It previously did not: this
 * function returned `void`, discarded `sendEmail`'s result and swallowed every
 * throw, so an invitation that never left the building was indistinguishable
 * from one that did. `POST /api/auth/register` then reported
 * `credentialsEmailed: true` off the mere existence of a temp password, and the
 * roster UI said "created successfully" — while the invitee, whose ONLY
 * credential lives in that email, got nothing and nobody was told.
 */
export type InvitationDispatch = {
  sent: boolean;
  /** Machine-readable cause when `sent` is false; null on success. */
  reason: 'skipped' | 'no-transport' | 'failed' | null;
  /** Human-readable detail for the failure, surfaced to the admin who invited. */
  detail: string | null;
};

/**
 * Send the invitation/welcome email for a freshly provisioned identity. Every
 * user-creation flow (tenant admin, roster, bulk upload) reaches this via
 * createCentralIdentity, so this is the ONE place invitations are dispatched.
 *
 * Best-effort: a mail outage must never FAIL identity provisioning — but it must
 * never be SILENT either. Errors are still caught (the account survives them);
 * they are now reported back through the return value instead of vanishing.
 * `orgName` is looked up for context.
 */
async function sendInvitation(params: {
  email: string;
  firstName: string;
  role: string;
  orgId: string;
  tempPassword: string | null;
  /** Single-use central invitation token; null when there was nothing to accept. */
  invitationToken: string | null;
  /** Display name of the admin who invited them — the other apps show this. */
  inviterName?: string;
  /** `native` (temp password) or `sso` (Google/Microsoft), as in quikscale. */
  inviteMethod?: (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];
  ssoProvider?: SsoProvider | null;
}): Promise<InvitationDispatch> {
  try {
    // Both lookups are COSMETIC — they only choose the org name and the role
    // vocabulary in the email body. Neither may prevent the invitation from
    // being sent, so each is isolated behind its own catch.
    //
    // This is not hypothetical. Both used to sit in a single `Promise.all`
    // inside the outer try/catch below, which swallows everything: any failure
    // resolving the tenant row aborted the whole function and the invitee got
    // NO EMAIL, with only a log line to show for it. The `.catch()` chained to
    // the tenant lookup did not help either — when `db.lmsTenant` is
    // undefined, reading `.findUnique` throws SYNCHRONOUSLY, before there is a
    // promise to attach a catch to.
    const org = await orgDb.org
      .findUnique({ where: { id: params.orgId }, select: { name: true } })
      .catch(() => null);

    // The tenant's kind decides the role vocabulary: a school head is a
    // "School Administrator" with "Students", not a "Tenant Administrator" with
    // "Learners". Missing row, missing model or a DB blip → corporate wording.
    let tenant: { tenantType: string } | null = null;
    try {
      tenant = await db.lmsTenant.findUnique({
        where: { id: params.orgId },
        select: { tenantType: true },
      });
    } catch {
      /* cosmetic only — keep the default vocabulary and still send */
    }
    // THE SHARED TEMPLATE, not the LMS's own.
    //
    // quikscale, quikasset, quikinfra, quiktrack and quiksupport all send
    // `renderInvitationEmail` from `@quikit/shared`; QuikLMS was the only app with
    // a private template, so an LMS invitee received a visibly different email from
    // the same person invited by any other app. `lib/email-templates.ts`
    // `invitationEmail()` stays for the flows that still use it (welcome kit,
    // admin reset) — only the invitation switches.
    //
    // The school/corporate vocabulary is NOT lost in the move: the shared
    // template's `role` is free text, so `roleDisplayNameFor` still turns
    // TENANT_ADMIN into "School Administrator" for a school tenant. That was the
    // one thing the private template had and the shared one does not compute.
    const tenantType = tenant?.tenantType === 'school' ? 'school' : 'corporate';
    const { subject, html } = renderInvitationEmail({
      to: params.email,
      firstName: params.firstName,
      orgName: org?.name ?? 'your organisation',
      orgLogoUrl: null,
      orgBrandColor: null,
      inviterName: params.inviterName ?? 'QuikLMS Admin',
      role: roleDisplayNameFor(params.role, tenantType),
      appNames: ['QuikLMS LMS'],
      token: params.invitationToken ?? '',
      // The shared template builds `${appBaseUrl}/login` and
      // `${appBaseUrl}/invitations/accept?token=…` itself, so this must be the
      // CENTRAL AUTH host — the only place that validates the token, enforces the
      // 7-day TTL and sets the password. Pointing it at the LMS would hand the
      // invitee a login form that cannot accept anything.
      appBaseUrl: invitationBaseUrl(),
      inviteMethod: params.inviteMethod ?? INVITE_METHOD.NATIVE,
      ssoProvider: params.ssoProvider ?? null,
      tempPassword: params.tempPassword ?? '',
    });
    // `sendEmail` returns null — it does NOT throw — when neither SMTP_HOST nor
    // RESEND_API_KEY is configured, which is its documented signal for "NOT
    // SENT" (see the `SendEmailResult` doc in lib/email.ts: "callers are
    // expected to branch on it"). This caller did not branch on it, which is how
    // an environment with no mail credentials reported every invitation as
    // delivered. Branch on it.
    const result = await sendEmail({ to: params.email, subject, html });
    if (!result) {
      // eslint-disable-next-line no-console
      console.error(
        `[identity] invitation NOT sent to ${params.email}: no mail transport configured ` +
          `(set SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY on this deployment).`,
      );
      return {
        sent: false,
        reason: 'no-transport',
        detail: 'No mail transport is configured on this server (SMTP_HOST / RESEND_API_KEY).',
      };
    }
    return { sent: true, reason: null, detail: null };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[identity] invitation email failed (provisioning kept):', err);
    return {
      sent: false,
      reason: 'failed',
      detail: err instanceof Error ? err.message : 'Unknown mail transport error.',
    };
  }
}

/**
 * LMS role → platform membership role (coarse org-level tier).
 *
 * ONLY `ADMIN` IS `org_admin`. A TENANT_ADMIN used to map here too, which made the
 * tenant's own administrator an admin of the PLATFORM org as well — able to manage
 * that org in quikit, and carried into `ADMIN_TIER_ROLES`, whose app-access rule
 * (`createGetOrgId`) skips the per-user `UserAppAccess` check for anyone in it.
 * Product decision (2026-08-11): a tenant admin administers their tenant, not the
 * platform, and cannot become a provider themselves.
 *
 * `member` is safe here even though it is also what a LEARNER maps to, because the
 * two are never told apart by THIS value: a tenant admin's authority comes from
 * `app_quiklms.UserAppRole` (TENANT_ADMIN), and their app access from the
 * `UserAppAccess` row `createCentralIdentity` writes in the same transaction as the
 * membership — so losing admin-tier costs them nothing.
 *
 * The one behaviour that does change is the LAST-RESORT fallback in
 * `mapPlatformRoleToLmsRole`, which reads this value when BOTH in-app rows are
 * missing: a tenant admin now resolves to LEARNER rather than ADMIN. That is the
 * safe direction — it locks someone out of their own admin screens instead of
 * handing them the top tier and the shared-catalog approve/reject powers.
 *
 * NOT RETROACTIVE. Tenant admins provisioned before this change keep `org_admin`;
 * the `isTenantOrg` argument to `mapPlatformRoleToLmsRole` is what keeps THEM from
 * resolving to ADMIN. Changing the stored rows needs a backfill.
 */
export function toMembershipRole(lmsRole: string): string {
  switch (lmsRole) {
    case 'ADMIN':
      return 'org_admin';
    case 'SUB_ADMIN':
      return 'app_admin';
    default:
      return 'member'; // TENANT_ADMIN / MANAGER / TEACHER / PARENT / LEARNER
  }
}

/** LMS role → per-app access role. */
function toAppRole(lmsRole: string): string {
  return lmsRole === 'TENANT_ADMIN' || lmsRole === 'SUB_ADMIN' ? 'admin' : 'member';
}

export interface CreateCentralIdentityInput {
  email: string;
  firstName: string;
  lastName: string;
  orgId: string;
  lmsRole: string;
  /**
   * Whether to dispatch the invitation/welcome email. Defaults to true — every
   * admin-driven creation flow (tenant onboarding, roster, bulk upload) invites
   * the person. Set false only for flows where the user is not meant to be
   * notified (e.g. a silent backfill).
   */
  sendInvite?: boolean;
  /** Platform `User.id` of the admin performing the invite — `OrgMember.createdBy`. */
  createdByUserId?: string;
  /**
   * `native` seeds a temp password; `sso` seeds NONE and the invitee signs in with
   * Google/Microsoft. Ported from quikscale's `invitationMethod`, which every other
   * app offers and QuikLMS hardcoded to `native` — so an LMS-created person could
   * never be an SSO-only user even in an org that uses SSO exclusively.
   */
  inviteMethod?: (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];
  /** Display name of the inviting admin, shown in the email. */
  inviterName?: string;
}

export interface CreateCentralIdentityResult {
  userId: string;
  tempPassword: string | null; // null when the platform user already had a password
  reused: boolean; // true when an existing platform User was linked
  /**
   * True when an invitation was minted — a single-use token was issued and mailed.
   *
   * It no longer means access is withheld: the membership is created `active`, as in
   * every other app, so the token is the deep-link to the set-password screen rather
   * than a gate. False when they were ALREADY an active member of the org, in which
   * case there was nothing to invite them to and no token was issued.
   */
  invited: boolean;
  /**
   * Whether the invitation email ACTUALLY left the server.
   *
   * Distinct from `invited` (a token was minted) and from `tempPassword != null`
   * (a credential was generated). Those two say what we prepared; this says what
   * was delivered. The roster screens no longer offer a password field, so this
   * mail is the invitee's only route to a working credential — a caller that
   * cannot tell whether it went is a caller that cannot warn anybody.
   */
  invitationEmailed: boolean;
  /** Why `invitationEmailed` is false, for the admin who invited. Null on success. */
  invitationEmailError: string | null;
}

export async function createCentralIdentity(
  input: CreateCentralIdentityInput,
): Promise<CreateCentralIdentityResult> {
  if (!ORG_DB_ENABLED) {
    throw BadRequest(
      'Identity provisioning is not available on this server.',
    );
  }

  const email = input.email.trim().toLowerCase();
  const { firstName, lastName, orgId, lmsRole } = input;
  if (!email) throw BadRequest('Email is required to create a login-capable user.');

  const membershipRole = toMembershipRole(lmsRole);
  const appRole = toAppRole(lmsRole);

  // FR-SA-004, as quikscale enforces it: an SSO invitation must resolve to a known
  // provider, or we would create a passwordless user who can never sign in. Fail
  // BEFORE any row is written rather than leaving a dead account behind.
  const inviteMethod = input.inviteMethod ?? INVITE_METHOD.NATIVE;
  const isSso = inviteMethod === INVITE_METHOD.SSO;
  let ssoProvider: SsoProvider | null = null;
  if (isSso) {
    ssoProvider = await classifySsoProviderAsync(email);
    if (!ssoProvider) {
      throw BadRequest('SSO invitations require a Google or Microsoft email address.');
    }
  }

  // 1) User — reuse by email or create with a fresh temp password.
  const existing = await orgDb.user.findUnique({
    where: { email },
    select: { id: true, password: true },
  });

  let userId: string;
  // SSO invitees get NO password at all — `auth.User.password` is nullable, so the
  // credentials provider cannot authenticate them and only Google/Microsoft will
  // work. Same rule as quikscale: `mustChangePassword` is meaningless without one.
  let tempPassword: string | null = isSso ? null : generateTempPassword();

  if (existing) {
    userId = existing.id;
    if (!existing.password && tempPassword) {
      await orgDb.user.update({
        where: { id: userId },
        data: { password: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
      });
    } else {
      tempPassword = null; // keep their existing password (or stay passwordless for SSO)
    }
  } else {
    const created = await orgDb.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: tempPassword ? await bcrypt.hash(tempPassword, 10) : null,
        mustChangePassword: !isSso,
      },
      select: { id: true },
    });
    userId = created.id;
  }

  // 2) OrgMember — the CENTRAL INVITATION PROTOCOL (baseline §6A).
  //
  // This used to write `status: 'active'` unconditionally, with no token, no
  // `invitedAt`, and no `inviteAppIds`. That skipped the protocol entirely: no
  // single-use accept token existed, so `<auth>/invitations/accept?token=…`
  // could never be used for an LMS-created person, the 7-day TTL was never
  // enforced, and the platform's auto-accept callbacks had nothing to accept.
  // It also silently activated a membership nobody had confirmed.
  //
  // Now the membership carries a single-use token, `invitedAt` and
  // `inviteAppIds`, exactly as `apps/admin`'s POST /api/members does — but it
  // is created ACTIVE (see `memberStatus` below) so access is not withheld
  // pending acceptance. It is also reconciled by whichever comes
  // first: the invitee clicking the emailed accept link, or the platform's
  // auto-accept on their first central login (packages/auth `jwt` callback for
  // native invites) — which runs BEFORE org auto-selection, so a freshly
  // accepted member still lands with an orgId resolved.
  const [existingMembership, app] = await Promise.all([
    orgDb.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { id: true, status: true },
    }),
    orgDb.app.findUnique({ where: { slug: QUIKLMS_SLUG }, select: { id: true } }),
  ]);

  // NEVER demote a live membership. An existing ACTIVE member being added to
  // the LMS roster (a colleague who already uses QuikCRM, say) must not be
  // flipped back to `invited` — that would revoke their access to every OTHER
  // app in the org until they re-accepted. They are already in; there is
  // nothing to accept, so we only reconcile their role.
  const alreadyActive = existingMembership?.status === 'active';
  const invitationToken = alreadyActive ? null : randomBytes(32).toString('hex');

  /**
   * `active`, matching every other app on the platform.
   *
   * THE CONVENTION, measured rather than assumed. quikscale, quikasset,
   * quikinfra, quiktrack and quiksupport all create the membership `active` and
   * use the `invitationToken` purely as the deep-link to the set-password screen.
   * Across those five apps there are ZERO writes of `status: "invited"`. QuikLMS
   * was the only app that gated access on acceptance, which is what made an
   * LMS-created person behave differently from the same person created anywhere
   * else in the suite.
   *
   * WHAT THIS GIVES UP, stated plainly: access is no longer withheld until the
   * invitation is accepted. An invitee can sign in with the temp password before
   * clicking the emailed link. The token remains single-use and 7-day TTL'd
   * (enforced by `apps/auth/app/api/invitations/accept`), so the set-password flow
   * and the replay guard are unchanged — but it is no longer an access gate.
   *
   * HISTORY, so nobody re-reverts this by accident. `invited` was chosen for
   * baseline §6A, briefly forced to `active` when it broke every LMS login
   * (`packages/auth/get-tenant-id.ts` resolves an org only when the membership is
   * `active`, so an invited person had no org and bounced to the launcher), then
   * set back to `invited` once the real cause was fixed in `packages/auth` — the
   * `jwt` auto-accept had been filtering on `inviteMethod: "native"`, so SSO
   * invitees matched nothing and were never accepted. That fix stands and is why
   * `invited` WORKED. This change is not a bug fix; it is a deliberate move to the
   * platform convention, requested so that first-invitation behaviour is identical
   * in every app.
   */
  const memberStatus = 'active';

  await orgDb.$transaction(async (tx) => {
    if (alreadyActive) {
      await tx.orgMember.update({
        where: { id: existingMembership!.id },
        data: { role: membershipRole },
      });
    } else if (existingMembership) {
      // Re-invite a previously removed/pending member: reset the existing row
      // rather than creating a duplicate (mirrors apps/admin).
      await tx.orgMember.update({
        where: { id: existingMembership.id },
        data: {
          role: membershipRole,
          status: memberStatus,
          invitationToken,
          invitedAt: new Date(),
          acceptedAt: null,
          inviteMethod,
          inviteProvider: ssoProvider,
          inviteAppIds: app ? [app.id] : [],
          ...(input.createdByUserId ? { createdBy: input.createdByUserId } : {}),
        },
      });
    } else {
      await tx.orgMember.create({
        data: {
          orgId,
          userId,
          role: membershipRole,
          status: memberStatus,
          invitationToken,
          invitedAt: new Date(),
          inviteMethod,
          inviteProvider: ssoProvider,
          // Consumed by the auto-accept path to grant access on activation.
          inviteAppIds: app ? [app.id] : [],
          ...(input.createdByUserId ? { createdBy: input.createdByUserId } : {}),
        },
      });
    }

    // 2b) Local invitation record — the audit/list shadow of the membership
    //     lifecycle above. Written INSIDE the transaction: it is a record OF
    //     this write, so it must not survive a rollback of it (unlike the
    //     email, which is external and stays best-effort).
    //
    //     Skipped when nothing was minted (`alreadyActive`) — there is no
    //     invitation to record, and inventing a Pending row for someone who is
    //     already a member would be a lie in the list UI.
    if (invitationToken) {
      // A resend supersedes any invitation still outstanding for this address
      // in this org, so the list shows one live invite per person rather than a
      // pile of stale Pending rows.
      await tx.lmsInvitation.updateMany({
        where: { orgId, email, status: 'Pending', deletedAt: null },
        data: { status: 'Revoked', deletedAt: new Date() },
      });

      await tx.lmsInvitation.create({
        data: {
          orgId,
          email,
          firstName,
          lastName,
          role: lmsRole,
          // SHA-256 of the emailed token — enough to correlate a link with its
          // audit row, useless to anyone who reads this table. The raw token
          // lives only on quikit.OrgMember.
          token: createHash('sha256').update(invitationToken).digest('hex'),
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
          status: 'Pending',
          invitedBy: input.createdByUserId ?? null,
          lmsUserId: userId,
        },
      });
    }

    // 3) UserAppAccess — granted immediately, matching apps/admin. The accept
    //    path re-creates these idempotently from `inviteAppIds`, so the two
    //    routes to activation converge on the same grants.
    if (app) {
      await tx.userAppAccess.upsert({
        where: { userId_orgId_appId: { userId, orgId, appId: app.id } },
        update: { role: appRole },
        create: {
          userId,
          orgId,
          appId: app.id,
          role: appRole,
          ...(input.createdByUserId ? { grantedBy: input.createdByUserId } : {}),
        },
      });
    }
  });

  // 4) Invitation email — best-effort; never blocks or fails provisioning, but
  //    its outcome is REPORTED rather than discarded (see `InvitationDispatch`).
  let dispatch: InvitationDispatch = {
    sent: false,
    reason: 'skipped',
    detail: 'The caller asked for no invitation email.',
  };
  if (input.sendInvite !== false) {
    dispatch = await sendInvitation({
      email,
      firstName,
      role: lmsRole,
      orgId,
      tempPassword,
      invitationToken,
      inviterName: input.inviterName,
      inviteMethod,
      ssoProvider,
    });
  }

  return {
    userId,
    tempPassword,
    reused: Boolean(existing),
    invited: !alreadyActive,
    invitationEmailed: dispatch.sent,
    invitationEmailError: dispatch.sent ? null : dispatch.detail,
  };
}

// ---------------------------------------------------------------------------
// Centralized provisioning helpers — the ONE path every user/tenant-creation
// flow must use, so every account is login-capable via QuikIT SSO ("each means
// each"). No flow may write a bare LMS User without a central identity.
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'org';
}

async function uniqueOrgSlug(base: string): Promise<string> {
  const root = slugify(base);
  let slug = root;
  let n = 1;
  while (await orgDb.org.findUnique({ where: { slug }, select: { id: true } })) slug = `${root}-${n++}`;
  return slug;
}

/**
 * Provision a NEW platform Org for a tenant being onboarded and enable QuikLMS
 * for it. Returns the platform Org id — used AS the LMS Tenant id (orgId-native).
 *
 * Mirrors the canonical self-serve org creation in
 * `apps/auth/app/api/auth/register/complete` (baseline §8A), which creates the
 * Org, its billing `Subscription` and the admin membership in ONE transaction.
 * This used to create a bare `Org` row and then, in two further unsynchronised
 * writes, look up the App and upsert `OrgAppAccess` — leaving three defects:
 *
 *   1. NO SUBSCRIPTION. An org with no `Subscription` row is only "grandfathered"
 *      by the absence of the row (see SUBSCRIPTION_STATUS in @quikit/shared).
 *      Every LMS-onboarded tenant sat outside the billing model entirely, so
 *      `/api/verify-token`'s `subscriptionActive` had nothing to report on.
 *   2. NO PLAN. `Org.plan` was left to the column default instead of being set
 *      deliberately, so an LMS tenant was indistinguishable from a legacy row.
 *   3. NOT ATOMIC. A failure after `org.create` committed an Org with no
 *      entitlement — a tenant that exists but that nobody can open.
 *
 * The admin `OrgMember` is deliberately NOT created here: `onboardTenant`
 * creates it immediately afterwards through `provisionLmsUser`, which also
 * needs to hash a password and send mail (neither belongs inside a DB
 * transaction). This function owns exactly the org-shaped writes.
 */
export interface ProvisionOrgInput {
  name: string;
  billingEmail?: string;
  /** Platform `User.id` of the operator onboarding this tenant — audit trail. */
  createdByUserId?: string;
  /**
   * Length of the per-app QuikLMS trial, in days.
   *
   * DEFAULTS TO `null` = no trial → `trialEndsAt: null`, which the platform
   * reads as "active / paid / grandfathered" (see the doc comment on
   * `OrgAppAccess.trialEndsAt`). That is the correct semantic here and it
   * preserves the behaviour this function already had: a tenant onboarded by
   * the operator through the LMS wizard is a SOLD tenant, not a self-serve
   * trial. The value is now explicit and caller-controllable instead of being
   * an unstated side effect — pass `TRIAL_DURATION_DAYS` to start a real trial.
   */
  trialDays?: number | null;
}

export async function provisionOrgForTenant(input: ProvisionOrgInput): Promise<string> {
  if (!ORG_DB_ENABLED) {
    throw BadRequest('Identity provisioning is not available on this server.');
  }

  // Resolved BEFORE the transaction, and a missing row is now a hard error
  // rather than a silent skip.
  //
  // This used to be `if (app) { … }` — when the App row was absent the org was
  // created with NO `OrgAppAccess`, silently. That was survivable only while
  // nothing checked entitlement. It no longer is: `lib/auth/central-access`
  // now refuses anyone whose org lacks `OrgAppAccess.enabled`, so a silent skip
  // here would hand back a tenant that every single one of its users is locked
  // out of, with no error anywhere to explain why. Fail loudly at onboarding
  // instead — the fix (seed the App catalog) is an operator action.
  const app = await orgDb.app.findUnique({ where: { slug: QUIKLMS_SLUG }, select: { id: true } });
  if (!app) {
    throw BadRequest(
      `QuikLMS is not registered in the platform App catalog (slug "${QUIKLMS_SLUG}"). ` +
        'Seed it via packages/database/prisma/seed-oauth.ts before onboarding tenants — ' +
        'without it the new org would have no app entitlement and nobody could sign in.',
    );
  }

  // Slug uniqueness is checked-then-used, so a concurrent onboard of the same
  // org name can still collide on `Org.slug @unique`. That surfaces as a P2002
  // → 409 through lib/http, which is the correct answer for a duplicate.
  const slug = await uniqueOrgSlug(input.name);

  const trialEndsAt =
    input.trialDays == null ? null : new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000);

  const org = await orgDb.$transaction(async (tx) => {
    const created = await tx.org.create({
      data: {
        name: input.name,
        slug,
        status: 'active',
        plan: TENANT_PLANS.STARTUP,
        ...(input.billingEmail ? { billingEmail: input.billingEmail } : {}),
        ...(input.createdByUserId ? { createdBy: input.createdByUserId } : {}),
      },
      select: { id: true },
    });

    // Billing row — `active` rather than `trialing`, matching register/complete:
    // the org-level subscription is what gates the org, while any trial UX is
    // driven per-app by OrgAppAccess.trialEndsAt below.
    await tx.subscription.create({
      data: {
        orgId: created.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        planSlug: TENANT_PLANS.STARTUP,
        source: 'quiklms_tenant_onboarding',
      },
    });

    // Entitlement. `create`, not `upsert` — the org was just created inside this
    // transaction, so no row can pre-exist and an upsert would only hide a bug.
    await tx.orgAppAccess.create({
      data: {
        orgId: created.id,
        appId: app.id,
        enabled: true,
        trialEndsAt,
        ...(input.createdByUserId ? { updatedBy: input.createdByUserId } : {}),
      },
    });

    return created;
  });

  // Seed this org's QuikLMS AppRole catalogue so the Admin Portal role dropdown
  // is populated and assignAppRoles can resolve roles by name — matching how the
  // launcher's grant flow provisions the other apps. Best-effort: a seeding
  // failure must not fail tenant onboarding (the lazy seed / provision-roles
  // endpoint remain the safety net).
  try {
    // Catalogue AND grants. Grants are not optional any more: authorisation fails
    // closed, so a new tenant with roles but no `RolePermission` rows would refuse
    // every request its own admin makes on first login.
    await ensureLmsRbacSeeded(org.id);
  } catch {
    /* advisory — see note above */
  }

  return org.id;
}

/**
 * The single centralized user-creation entry point. Creates the platform
 * identity (User + OrgMember + UserAppAccess) via createCentralIdentity, then
 * the LMS row with the SAME id (orgId-native). Pass any role-specific LMS fields
 * (subjects, grade, childrenIds, …) — they flow through to the LMS row.
 */
export interface ProvisionLmsUserResult extends CreateCentralIdentityResult {
  /** The LMS row (id + any generated codes like employeeId/studentId). */
  lms?: { id: string; employeeId?: string; [k: string]: unknown };
}

/** LMS roles that carry organisation-administrator authority. */
const ADMIN_TIER_ROLES = new Set(['ADMIN', 'TENANT_ADMIN', LMS_SYSTEM_ADMIN_ROLE]);

/**
 * The first person provisioned into an org becomes its administrator.
 *
 * Ported from quikscale's `POST /api/org/users`, which counts holders of the admin
 * AppRole and hands the role to the first invitee when there are none:
 *
 *     const adminMemberCount = await db.userAppRole.count({ where: { orgId, roleId: adminRoleId } });
 *     const targetRoleId = adminMemberCount === 0 ? adminRoleId : userRoleId;
 *
 * WHY IT MATTERS MORE HERE THAN THERE. Authorisation now fails closed off
 * `app_quiklms.UserAppRole`, so an org with no admin ASSIGNMENT has nobody who can
 * create one — not the tenant admin, not a sub admin. It is unrecoverable from
 * inside the product; it needs a script. QuikLMS previously had no such guard: the
 * only reason it never bit is that `onboardTenant` happens to provision its
 * TENANT_ADMIN first, so any flow that reached an org by another route (a bulk
 * upload into a fresh org, a re-provisioned tenant whose admin creation failed
 * midway) could leave one permanently locked.
 *
 * Counts ASSIGNMENTS, not `LmsUser.role`, because assignments are what authorise.
 * An org whose only admin has an `LmsUser.role` of TENANT_ADMIN but no assignment is
 * effectively admin-less, and the right repair for that is
 * `scripts/backfill-user-app-roles.ts`, not silently promoting the next newcomer.
 */
async function roleForNewMember(orgId: string, requested: string): Promise<string> {
  if (ADMIN_TIER_ROLES.has(requested)) return requested;

  try {
    const admins = await db.lmsUserAppRole.count({
      where: { orgId, role: { name: { in: ['TENANT_ADMIN', LMS_SYSTEM_ADMIN_ROLE] } } },
    });
    if (admins > 0) return requested;
  } catch {
    // Can't tell — leave the caller's intent alone rather than mint an admin off a
    // failed read. The org keeps whatever admin it has.
    return requested;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[identity] org ${orgId} has no administrator; provisioning its first member as ` +
      `TENANT_ADMIN instead of ${requested} so the org is not left unadministrable.`,
  );
  return 'TENANT_ADMIN';
}

/**
 * Materialise the LMS row for someone who ALREADY holds a central identity.
 *
 * WHY THIS EXISTS. `app_quiklms.UserAppRole.userId` is a foreign key to
 * `app_quiklms.users(id)` — a LOCAL table. QuikScale's equivalent points straight
 * at the central `auth.User`, so its `/api/internal/provision-roles` can assign a
 * role to a freshly-invited org admin the moment the launcher calls it. QuikLMS
 * cannot: without a local row the insert raises `UserAppRole_userId_fkey`, so
 * `ensureUserOnLmsRole` bails out instead.
 *
 * That bail-out is what left the org's FIRST admin — the person quikit invites
 * when it creates the org — with no assignment at all. `POST /api/super/orgs`
 * writes `User` + `OrgMember` centrally and then calls provision-roles with that
 * CENTRAL id; nothing has created an LMS row for them at that point, and nothing
 * ever would, because `provisionLmsUser` (the only writer) runs for people the LMS
 * itself invites. The visible damage was not just the missing row:
 *
 *   - `isOrgAdmin()` reads assignments, so it answered false for the org's admin.
 *   - `roleForNewMember` counts assignments to decide whether an org still has an
 *     administrator. With zero, the FIRST person that admin invited was silently
 *     promoted to TENANT_ADMIN whatever role was actually chosen.
 *   - The central `UserAppAccess` mirror sits AFTER the bail-out in
 *     `ensureUserOnLmsRole`, so the Admin Portal's "Roles per Application" column
 *     stayed blank for them too.
 *
 * Fixing the foreign key itself would mean editing the shared Prisma schema, which
 * is out of bounds for this app — so the LMS row is created here instead.
 *
 * Returns whether an LMS row now exists, so callers can report a real outcome
 * rather than assuming success. Never throws: this runs inside a best-effort
 * provisioning path, and a failure here must not discard the role/grant seeding
 * that already succeeded.
 */
export async function ensureLmsUserForCentralId(
  userId: string,
  orgId: string,
  lmsRole: LmsUserRole,
): Promise<boolean> {
  if (!userId || !orgId) return false;

  try {
    // Idempotent — `id` still doubles as the central id for provisioned rows.
    const existing = await db.lmsUser.findUnique({ where: { id: userId }, select: { id: true } });
    if (existing) return true;

    const central = await orgDb.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    // No central row means the caller passed an id this platform does not know.
    // Inventing an LMS person for it would be worse than reporting the skip.
    if (!central?.email) return false;

    // ONE LmsUser row per email today: `id` doubles as the central user id, so the
    // per-org uniqueness that would allow the same person in two orgs is not live
    // yet (see the `authUserId` note on the model). A collision here means this
    // email already belongs to a different LMS row — `registerUser` would throw, and
    // stealing the row would be worse. Report the skip and let a human look.
    const emailTaken = await db.lmsUser.findFirst({
      where: { email: central.email.toLowerCase().trim() },
      select: { id: true },
    });
    if (emailTaken) return false;

    await registerUser({
      id: userId,
      email: central.email,
      firstName: central.firstName ?? '',
      lastName: central.lastName ?? '',
      role: lmsRole,
      orgId,
    });
    return true;
  } catch {
    return false;
  }
}

export async function provisionLmsUser(
  input: CreateCentralIdentityInput & Partial<RegisterUserInput>,
): Promise<ProvisionLmsUserResult> {
  // Decided ONCE, before any of the three writes that consume it — the central
  // identity mapping, the LMS row, and the RBAC assignment. Deriving it per write
  // is how the four representations of a role drift apart.
  const lmsRole = await roleForNewMember(input.orgId, input.lmsRole);

  const identity = await createCentralIdentity({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    orgId: input.orgId,
    lmsRole,
    createdByUserId: input.createdByUserId,
    // `skipEmail` is the flag the CALLERS actually set — the students roster
    // exposes it as a checkbox, and bulk upload sets it per row. It was never
    // mapped onto `sendInvite`, so it did nothing: ticking "skip email" still
    // sent one. Worse, bulk upload substitutes a synthetic address
    // (`student_<ts>_<i>@noemail.placeholder`) when a row has skipEmail and no
    // email — so every such row mailed an invitation into the void.
    // An explicit `sendInvite` still wins, for callers that pass it directly.
    sendInvite: input.sendInvite ?? (input.skipEmail === true ? false : undefined),
    // Forwarded rather than defaulted here: `createCentralIdentity` owns the SSO
    // domain check and the "no password for SSO" rule, so passing these straight
    // through keeps one implementation of both. Undefined → native, as before.
    inviteMethod: input.inviteMethod,
    inviterName: input.inviterName,
  });

  // LMS row with the shared central id (idempotent — skip if already linked).
  const existingLms = await db.lmsUser.findUnique({
    where: { id: identity.userId },
    select: { id: true },
  });
  let lms: ProvisionLmsUserResult['lms'];
  if (!existingLms) {
    const res = await registerUser({
      ...(input as Partial<RegisterUserInput>),
      id: identity.userId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: lmsRole,
      orgId: input.orgId,
    });
    lms = res.data;
  }

  // Mirror the provisioned role into the platform RBAC tables so the user's
  // QuikLMS role is visible in the Admin Portal and resolves through the same
  // app_quiklms.UserAppRole path the other apps use. Best-effort (self-seeds the
  // role catalogue); a failure never blocks user creation.
  try {
    await ensureUserOnLmsRole(identity.userId, input.orgId, lmsRole as LmsUserRole);
  } catch {
    /* advisory — the assignment is re-derivable from LmsUser.role */
  }

  return { ...identity, lms };
}
