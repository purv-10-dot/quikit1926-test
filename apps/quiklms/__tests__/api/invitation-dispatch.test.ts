/**
 * Invitations must work for EVERY role a tenant can invite, in both school and
 * corporate tenants — not just LEARNER.
 *
 * Two defects made non-learner invites unreliable:
 *
 *  1. CLIENT-SIDE BAIL. All five roster screens (students, teachers, parents,
 *     sub-admins, user-management) read the actor's org from
 *     `sessionStorage('user')` and hard-returned with "Tenant ID not found"
 *     when it was absent. That key is populated asynchronously by
 *     `refreshUser()` in providers, so submitting before hydration finished
 *     blocked the invitation — for a request the SERVER would have scoped
 *     correctly on its own, since `/auth/register` derives orgId from
 *     `actor.orgId` and ignores `body.orgId` for every non-super-admin.
 *
 *  2. `skipEmail` WAS NEVER HONOURED. Callers set `skipEmail`; the identity
 *     service reads `sendInvite`. Nothing mapped one to the other, so the
 *     students roster's "skip email" checkbox did nothing, and bulk upload —
 *     which substitutes `student_<ts>_<i>@noemail.placeholder` for rows with
 *     skipEmail and no address — mailed invitations to synthetic addresses.
 *
 * These cover the server half: dispatch is role-agnostic, org comes from the
 * session, and skipEmail suppresses the mail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  transaction: vi.fn(),
  appFindUnique: vi.fn(),
  accessUpsert: vi.fn(),
  orgFindUnique: vi.fn(),
  lmsFindUnique: vi.fn(),
  registerUser: vi.fn(),
  invitationEmailArgs: vi.fn(),
  inviteCreate: vi.fn(),
  inviteUpdateMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/email-templates', () => ({
  invitationEmail: (a: { role: string; email: string }) => {
    h.invitationEmailArgs(a);
    return { subject: `Invite ${a.role}`, html: `<p>${a.email}</p>` };
  },
}));
vi.mock('@/lib/services/auth-service', () => ({ registerUser: h.registerUser }));
vi.mock('@quikit/database', () => ({
  db: {
    user: { findUnique: h.userFindUnique, create: h.userCreate, update: h.userUpdate },
    orgMember: {
      findUnique: h.memberFindUnique,
      create: h.memberCreate,
      update: h.memberUpdate,
    },
    app: { findUnique: h.appFindUnique },
    userAppAccess: { upsert: h.accessUpsert },
    org: { findUnique: h.orgFindUnique },
    $transaction: h.transaction,
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { lmsUser: { findUnique: h.lmsFindUnique } } }));

import { provisionLmsUser } from '@/lib/services/identity-service';

const base = { email: 'new@acme.test', firstName: 'Ada', lastName: 'L', orgId: 'org-1' };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindUnique.mockResolvedValue(null);
  h.userCreate.mockResolvedValue({ id: 'u-new' });
  h.memberFindUnique.mockResolvedValue(null);
  h.memberCreate.mockResolvedValue({});
  h.memberUpdate.mockResolvedValue({});
  h.inviteCreate.mockResolvedValue({});
  h.inviteUpdateMany.mockResolvedValue({ count: 0 });
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      orgMember: { create: h.memberCreate, update: h.memberUpdate },
      userAppAccess: { upsert: h.accessUpsert },
      lmsInvitation: { create: h.inviteCreate, updateMany: h.inviteUpdateMany },
    }),
  );
  h.appFindUnique.mockResolvedValue({ id: 'app-lms' });
  h.accessUpsert.mockResolvedValue({});
  h.orgFindUnique.mockResolvedValue({ name: 'Acme' });
  h.lmsFindUnique.mockResolvedValue(null);
  h.registerUser.mockResolvedValue({ data: { id: 'u-new' } });
  h.sendEmail.mockResolvedValue({ messageId: 'm1' });
});

describe('every invitable role gets an invitation', () => {
  // The roles a TENANT_ADMIN may assign, across school and corporate tenants.
  const ROLES = ['LEARNER', 'TEACHER', 'PARENT', 'MANAGER', 'SUB_ADMIN'];

  for (const role of ROLES) {
    it(`sends for ${role}`, async () => {
      await provisionLmsUser({ ...base, lmsRole: role });
      expect(h.sendEmail).toHaveBeenCalledTimes(1);
      expect(h.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'new@acme.test' });
    });
  }

  it('grants LMS app access for every role, so the invite leads somewhere', async () => {
    for (const role of ROLES) {
      h.accessUpsert.mockClear();
      await provisionLmsUser({ ...base, lmsRole: role });
      expect(h.accessUpsert).toHaveBeenCalledTimes(1);
    }
  });

  it('creates the platform identity AND the LMS row under one shared id', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'PARENT' });
    expect(h.registerUser.mock.calls[0][0]).toMatchObject({ id: 'u-new', role: 'PARENT' });
  });
});

describe('skipEmail actually suppresses the invitation', () => {
  it('does not mail when skipEmail is true', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', skipEmail: true });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('still provisions the user when the mail is skipped', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', skipEmail: true });
    expect(h.userCreate).toHaveBeenCalled();
    expect(h.registerUser).toHaveBeenCalled();
  });

  it('mails when skipEmail is false or absent', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', skipEmail: false });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('an explicit sendInvite:false still wins', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', sendInvite: false });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('an explicit sendInvite:true overrides skipEmail', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', skipEmail: true, sendInvite: true });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('a mail outage never costs the user account', () => {
  it('provisioning succeeds even when sending throws', async () => {
    h.sendEmail.mockRejectedValue(new Error('smtp down'));
    await expect(provisionLmsUser({ ...base, lmsRole: 'TEACHER' })).resolves.toMatchObject({
      userId: 'u-new',
    });
    expect(h.registerUser).toHaveBeenCalled();
  });
});

describe('re-inviting an existing platform user', () => {
  it('does not reset a password that already exists', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u-old', password: 'hashed' });
    const out = await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.userUpdate).not.toHaveBeenCalled();
    // No fresh credential to deliver.
    expect(out.tempPassword).toBeNull();
  });

  it('seeds a password when the platform user has none yet', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u-old', password: null });
    const out = await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.userUpdate).toHaveBeenCalled();
    expect(out.tempPassword).toBeTruthy();
  });
});

/**
 * The central invitation protocol (baseline §6A). Previously the membership was
 * written straight to `active` with no token, no `invitedAt` and no
 * `inviteAppIds`, so the platform accept flow could never run for an
 * LMS-created person.
 */
describe('central invitation protocol', () => {
  const memberData = () => h.memberCreate.mock.calls[0][0].data;

  it('creates the membership INVITED so the invitation gates access', async () => {
    // This was briefly forced to `active` because `invited` broke every
    // LMS-created login — an invited person had no active org, so
    // `createGetOrgId` found nothing and they bounced to the launcher.
    //
    // The cause was NOT this status. `packages/auth`'s jwt auto-accept filtered
    // on `inviteMethod: "native"` while signIn's filtered on `"sso"`, so an
    // invitee holding a native invite who signed in with Google/Microsoft
    // matched neither and was never accepted. That filter is removed; the jwt
    // callback now accepts any pending invite on any sign-in path, which makes
    // `invited` safe and restores the platform protocol.
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(memberData()).toMatchObject({ status: 'invited', inviteMethod: 'native' });
  });

  it('mints a single-use invitation token and stamps invitedAt for the 7-day TTL', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    const d = memberData();
    expect(d.invitationToken).toMatch(/^[0-9a-f]{64}$/); // randomBytes(32).hex
    expect(d.invitedAt).toBeInstanceOf(Date);
  });

  it('records inviteAppIds so the auto-accept path grants QuikLMS on activation', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(memberData().inviteAppIds).toEqual(['app-lms']);
  });

  it('grants UserAppAccess immediately as well, matching apps/admin', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(h.accessUpsert).toHaveBeenCalledTimes(1);
  });

  it('writes membership and app-access in ONE transaction', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('records the inviting admin', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER', createdByUserId: 'admin-1' });
    expect(memberData().createdBy).toBe('admin-1');
  });

  it('reports invited:true for a new member', async () => {
    const out = await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(out.invited).toBe(true);
  });
});

describe('an ALREADY-ACTIVE member is never demoted', () => {
  // The critical regression guard. Flipping a live membership back to `invited`
  // would revoke that person's access to every OTHER app in the org until they
  // re-accepted — a roster addition must not log a colleague out of QuikCRM.
  beforeEach(() => {
    h.userFindUnique.mockResolvedValue({ id: 'u-old', password: 'hashed' });
    h.memberFindUnique.mockResolvedValue({ id: 'm-1', status: 'active' });
  });

  it('does not create a second membership row', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.memberCreate).not.toHaveBeenCalled();
  });

  it('updates ONLY the role — status, token and invitedAt are left alone', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.memberUpdate).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { role: 'member' },
    });
  });

  it('reports invited:false — there was nothing to accept', async () => {
    const out = await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(out.invited).toBe(false);
  });

  it('still reconciles app access', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.accessUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('re-inviting a removed member resets the existing row', () => {
  beforeEach(() => {
    h.userFindUnique.mockResolvedValue({ id: 'u-old', password: 'hashed' });
    h.memberFindUnique.mockResolvedValue({ id: 'm-1', status: 'inactive' });
  });

  it('reuses the row rather than creating a duplicate', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    expect(h.memberCreate).not.toHaveBeenCalled();
    expect(h.memberUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns it to invited with a fresh token and clears the old acceptance', async () => {
    // Re-inviting a removed member puts them back behind an accept step rather
    // than silently restoring access — the same gate a first-time invite gets.
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
    const d = h.memberUpdate.mock.calls[0][0].data;
    expect(d).toMatchObject({ status: 'invited', acceptedAt: null });
    expect(d.invitationToken).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * The local invitation record (S-8). QuikLMS previously kept none: invites were
 * fire-and-forget, so there was no list, no revoke and no audit trail.
 */
describe('local invitation record', () => {
  const inviteData = () => h.inviteCreate.mock.calls[0][0].data;

  it('records the invitation', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'TEACHER', createdByUserId: 'admin-1' });

    expect(inviteData()).toMatchObject({
      orgId: 'org-1',
      email: 'new@acme.test',
      role: 'TEACHER',
      status: 'Pending',
      invitedBy: 'admin-1',
    });
  });

  it('stores a SHA-256 HASH of the token, never the raw value', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });

    const raw = h.memberCreate.mock.calls[0][0].data.invitationToken as string;
    const stored = inviteData().token as string;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(raw);
    expect(stored).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('stamps a 7-day expiry so the list can show an accurate state', async () => {
    const before = Date.now();
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });

    const ms = (inviteData().expiresAt as Date).getTime() - before;
    expect(ms).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 5000);
  });

  it('supersedes any invitation still outstanding for the same address', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });

    expect(h.inviteUpdateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', email: 'new@acme.test', status: 'Pending', deletedAt: null },
      data: expect.objectContaining({ status: 'Revoked' }),
    });
  });

  it('writes the record in the SAME transaction as the membership', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    // One transaction, and the invite row went through its tx client.
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.inviteCreate).toHaveBeenCalledTimes(1);
  });

  it('records NOTHING for an already-active member — there is no invitation', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u-old', password: 'hashed' });
    h.memberFindUnique.mockResolvedValue({ id: 'm-1', status: 'active' });

    await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });

    expect(h.inviteCreate).not.toHaveBeenCalled();
    expect(h.inviteUpdateMany).not.toHaveBeenCalled();
  });
});

describe('the invitation email points at the CENTRAL accept flow', () => {
  it('sends the accept URL carrying the token, not the LMS login page', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', 'https://authn.quikit.ai');
    try {
      await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
      const acceptUrl = h.invitationEmailArgs.mock.calls[0][0].acceptUrl as string;
      const token = h.memberCreate.mock.calls[0][0].data.invitationToken as string;
      expect(acceptUrl).toBe(`https://authn.quikit.ai/invitations/accept?token=${token}`);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('omits the accept URL for an already-active member — nothing to accept', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', 'https://authn.quikit.ai');
    try {
      h.userFindUnique.mockResolvedValue({ id: 'u-old', password: 'hashed' });
      h.memberFindUnique.mockResolvedValue({ id: 'm-1', status: 'active' });
      await provisionLmsUser({ ...base, lmsRole: 'TEACHER' });
      expect(h.invitationEmailArgs.mock.calls[0][0].acceptUrl).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('degrades to the login link when no central auth host is configured', async () => {
    await provisionLmsUser({ ...base, lmsRole: 'LEARNER' });
    expect(h.invitationEmailArgs.mock.calls[0][0].acceptUrl).toBeNull();
  });
});
