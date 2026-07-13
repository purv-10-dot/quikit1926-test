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
import bcrypt from 'bcryptjs';
import { generateTempPassword } from '@quikit/shared/temp-password';
import { orgDb, ORG_DB_ENABLED } from '@/lib/org-db';
import { prisma } from '@/lib/prisma';
import { registerUser, type RegisterUserInput } from '@/lib/services/auth-service';
import { BadRequest } from '@/lib/http';
import { sendEmail } from '@/lib/email';
import { invitationEmail } from '@/lib/email-templates';

const QUIKLMS_SLUG = 'quiklms';

/** The tenant login entry point — SSO handoff bounces through here. */
const LOGIN_URL = `${(process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3020').replace(/\/$/, '')}/login`;

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
}): Promise<void> {
  try {
    const org = await orgDb.org.findUnique({
      where: { id: params.orgId },
      select: { name: true },
    });
    const { subject, html } = invitationEmail({
      firstName: params.firstName,
      email: params.email,
      role: params.role,
      orgName: org?.name,
      tempPassword: params.tempPassword,
      loginUrl: LOGIN_URL,
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
}

export interface CreateCentralIdentityResult {
  userId: string;
  tempPassword: string | null; // null when the platform user already had a password
  reused: boolean; // true when an existing platform User was linked
}

export async function createCentralIdentity(
  input: CreateCentralIdentityInput,
): Promise<CreateCentralIdentityResult> {
  if (!ORG_DB_ENABLED) {
    throw BadRequest(
      'Identity provisioning is not configured on this server (ORG_DATABASE_URL is unset).',
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

  // 2) OrgMember — active membership in the caller's org.
  await orgDb.orgMember.upsert({
    where: { orgId_userId: { orgId, userId } },
    update: { status: 'active', role: membershipRole },
    create: { orgId, userId, role: membershipRole, status: 'active', inviteMethod: 'native' },
  });

  // 3) UserAppAccess — grant QuikLMS to the user.
  const app = await orgDb.app.findUnique({ where: { slug: QUIKLMS_SLUG }, select: { id: true } });
  if (app) {
    await orgDb.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId, orgId, appId: app.id } },
      update: { role: appRole },
      create: { userId, orgId, appId: app.id, role: appRole },
    });
  }

  // 4) Invitation email — the single dispatch point for every creation flow.
  //    Best-effort; never blocks or fails provisioning.
  if (input.sendInvite !== false) {
    await sendInvitation({
      email,
      firstName,
      role: lmsRole,
      orgId,
      tempPassword,
    });
  }

  return { userId, tempPassword, reused: Boolean(existing) };
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
 * for it (OrgAppAccess). Returns the platform Org id — used AS the LMS Tenant id
 * (orgId-native). Every onboarded tenant is thus a real platform org.
 */
export async function provisionOrgForTenant(input: {
  name: string;
  billingEmail?: string;
}): Promise<string> {
  if (!ORG_DB_ENABLED) {
    throw BadRequest('Identity provisioning is not configured on this server (ORG_DATABASE_URL is unset).');
  }
  const slug = await uniqueOrgSlug(input.name);
  const org = await orgDb.org.create({
    data: {
      name: input.name,
      slug,
      status: 'active',
      ...(input.billingEmail ? { billingEmail: input.billingEmail } : {}),
    },
    select: { id: true },
  });

  // Enable QuikLMS at the org level so the app is provisioned for the tenant.
  const app = await orgDb.app.findUnique({ where: { slug: QUIKLMS_SLUG }, select: { id: true } });
  if (app) {
    await orgDb.orgAppAccess.upsert({
      where: { orgId_appId: { orgId: org.id, appId: app.id } },
      update: { enabled: true },
      create: { orgId: org.id, appId: app.id, enabled: true },
    });
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
    sendInvite: input.sendInvite,
  });

  // LMS row with the shared central id (idempotent — skip if already linked).
  const existingLms = await prisma.user.findUnique({
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
  return { ...identity, lms };
}
