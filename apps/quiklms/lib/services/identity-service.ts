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
import { BadRequest } from '@/lib/http';

const QUIKLMS_SLUG = 'quiklms';

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

  return { userId, tempPassword, reused: Boolean(existing) };
}
