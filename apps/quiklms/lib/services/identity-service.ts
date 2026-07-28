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
import { SUBSCRIPTION_STATUS, TENANT_PLANS } from '@quikit/shared';
import { generateTempPassword } from '@quikit/shared/temp-password';
import type { LmsUserRole } from '@prisma/client';
import { orgDb, ORG_DB_ENABLED } from '@/lib/org-db';
import { db } from '@/lib/db';
import { seedLmsAppRoles, ensureUserOnLmsRole } from '@/lib/api/seed-lms-app-roles';
import { registerUser, type RegisterUserInput } from '@/lib/services/auth-service';
import { BadRequest } from '@/lib/http';
import { sendEmail } from '@/lib/email';
import { invitationEmail } from '@/lib/email-templates';

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
 * The CANONICAL accept link, hosted by the central auth app. Deliberately not
 * an LMS URL: `apps/auth/app/api/invitations/accept` is the one place that
 * validates the single-use token, enforces the 7-day TTL, blocks replay against
 * an already-active membership, sets the password, and calls `assignAppRoles`.
 * Pointing invitees at the LMS login form instead is what bypassed all of it.
 */
function acceptUrlFor(token: string): string | null {
  const base = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
  if (!base) return null; // No central auth host configured — fall back to the login link.
  return `${base}/invitations/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Send the invitation/welcome email for a freshly provisioned identity. Every
 * user-creation flow (tenant admin, roster, bulk upload) reaches this via
 * createCentralIdentity, so this is the ONE place invitations are dispatched.
 * Best-effort: a mail outage must never fail identity provisioning, so all
 * errors are swallowed (and logged). `orgName` is looked up for context.
 */
async function sendInvitation(params: {
  email: string;
  firstName: string;
  role: string;
  orgId: string;
  tempPassword: string | null;
  /** Single-use central invitation token; null when there was nothing to accept. */
  invitationToken: string | null;
}): Promise<void> {
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
    const { subject, html } = invitationEmail({
      firstName: params.firstName,
      email: params.email,
      role: params.role,
      orgName: org?.name,
      tempPassword: params.tempPassword,
      loginUrl: LOGIN_URL,
      acceptUrl: params.invitationToken ? acceptUrlFor(params.invitationToken) : null,
      tenantType: tenant?.tenantType === 'school' ? 'school' : 'corporate',
    });
    await sendEmail({ to: params.email, subject, html });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[identity] invitation email failed (provisioning kept):', err);
  }
}

/** LMS role → platform membership role (coarse org-level tier). */
function toMembershipRole(lmsRole: string): string {
  switch (lmsRole) {
    case 'SUPER_ADMIN':
    case 'TENANT_ADMIN':
      return 'org_admin';
    case 'SUB_ADMIN':
      return 'app_admin';
    default:
      return 'member'; // MANAGER / TEACHER / PARENT / LEARNER
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
}

export interface CreateCentralIdentityResult {
  userId: string;
  tempPassword: string | null; // null when the platform user already had a password
  reused: boolean; // true when an existing platform User was linked
  /**
   * True when a pending invitation was minted — the membership is `invited` and
   * access is withheld until it is accepted (by the emailed link or by the
   * invitee's first login). False when they were ALREADY an active member of
   * the org, in which case nothing was gated and no token was issued.
   */
  invited: boolean;
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

  // 1) User — reuse by email or create with a fresh temp password.
  const existing = await orgDb.user.findUnique({
    where: { email },
    select: { id: true, password: true },
  });

  let userId: string;
  let tempPassword: string | null = generateTempPassword();

  if (existing) {
    userId = existing.id;
    if (!existing.password) {
      await orgDb.user.update({
        where: { id: userId },
        data: { password: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
      });
    } else {
      tempPassword = null; // keep their existing password
    }
  } else {
    const created = await orgDb.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
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
   * The membership is created `invited` — the invitation GATES access, exactly
   * as the platform protocol intends (baseline §6A).
   *
   * HISTORY, worth keeping. This was briefly forced to `active` because
   * `invited` broke every LMS-created login: `packages/auth/get-tenant-id.ts`
   * resolves a user's org with `status: "active"`, so an invited person had no
   * org, could not get a session, and bounced to the launcher. Confirmed in
   * production — active memberships stopped at 07:26 while everything created
   * after sat at `invited`.
   *
   * The ROOT CAUSE was not this constant. It was in `packages/auth/index.ts`:
   * the `jwt` callback's auto-accept filtered on `inviteMethod: "native"`, and
   * the `signIn` callback's on `"sso"`. Invitations minted here are `native`
   * (a temp password is seeded), so an invitee who signed in with Google or
   * Microsoft matched NEITHER and was never accepted. That filter is gone; the
   * jwt callback now accepts any pending invitation for the authenticated user,
   * on every sign-in path.
   *
   * With that fixed, `invited` is safe: the membership activates on whichever
   * comes first — the emailed accept link, or the invitee's first login by any
   * method — and access is genuinely withheld until one of them happens.
   */
  const memberStatus = 'invited';

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
          inviteMethod: 'native',
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
          inviteMethod: 'native',
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

  // 4) Invitation email — best-effort; never blocks or fails provisioning.
  if (input.sendInvite !== false) {
    await sendInvitation({
      email,
      firstName,
      role: lmsRole,
      orgId,
      tempPassword,
      invitationToken,
    });
  }

  return { userId, tempPassword, reused: Boolean(existing), invited: !alreadyActive };
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
    await seedLmsAppRoles(org.id);
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

export async function provisionLmsUser(
  input: CreateCentralIdentityInput & Partial<RegisterUserInput>,
): Promise<ProvisionLmsUserResult> {
  const identity = await createCentralIdentity({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    orgId: input.orgId,
    lmsRole: input.lmsRole,
    createdByUserId: input.createdByUserId,
    // `skipEmail` is the flag the CALLERS actually set — the students roster
    // exposes it as a checkbox, and bulk upload sets it per row. It was never
    // mapped onto `sendInvite`, so it did nothing: ticking "skip email" still
    // sent one. Worse, bulk upload substitutes a synthetic address
    // (`student_<ts>_<i>@noemail.placeholder`) when a row has skipEmail and no
    // email — so every such row mailed an invitation into the void.
    // An explicit `sendInvite` still wins, for callers that pass it directly.
    sendInvite: input.sendInvite ?? (input.skipEmail === true ? false : undefined),
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
      role: input.lmsRole,
      orgId: input.orgId,
    });
    lms = res.data;
  }

  // Mirror the provisioned role into the platform RBAC tables so the user's
  // QuikLMS role is visible in the Admin Portal and resolves through the same
  // app_quiklms.UserAppRole path the other apps use. Best-effort (self-seeds the
  // role catalogue); a failure never blocks user creation.
  try {
    await ensureUserOnLmsRole(identity.userId, input.orgId, input.lmsRole as LmsUserRole);
  } catch {
    /* advisory — the assignment is re-derivable from LmsUser.role */
  }

  return { ...identity, lms };
}
