/**
 * An invitation that never left the server must not be reported as delivered.
 *
 * WHAT WAS BROKEN. The corporate Learners roster asked the admin to type a
 * password, and that password was dead input — `createCentralIdentity` generates
 * its own temp password for the central `auth.User` and mails THAT, while
 * `registerUser` writes none at all ("Credentials live only on auth.User").
 * So the invitation email is the invitee's ONLY route to a working credential.
 *
 * And nothing could tell whether it went. Three layers of silence, all fixed here:
 *
 *  1. `sendEmail` returns `null` — it does NOT throw — when neither SMTP_HOST nor
 *     RESEND_API_KEY is configured. That is its documented "NOT SENT" signal and
 *     `sendInvitation` discarded it.
 *  2. `sendInvitation` returned `void` and swallowed every throw, so an SMTP
 *     rejection was a console line and nothing more.
 *  3. `POST /api/auth/register` computed `credentialsEmailed` from
 *     `tempPassword != null` — "was a credential generated", not "was it sent" —
 *     so it answered `true` on a server with no mail transport at all.
 *
 * Net effect: learner created, UI said "created successfully", API said the
 * credentials were emailed, and the learner received nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  transaction: vi.fn(),
  appFindUnique: vi.fn(),
  accessUpsert: vi.fn(),
  orgFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  lmsUserFindUnique: vi.fn(),
  lmsUserFindFirst: vi.fn(),
  lmsUserCreate: vi.fn(),
  appRoleCount: vi.fn(),
  inviteCreate: vi.fn(),
  inviteUpdateMany: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/api/seed-lms-app-roles', () => ({
  ensureUserOnLmsRole: vi.fn(),
  LMS_SYSTEM_ADMIN_ROLE: 'admin',
}));
vi.mock('@/lib/api/seed-lms-permissions', () => ({ ensureLmsRbacSeeded: vi.fn() }));
vi.mock('@/lib/services/roster-profile', () => ({
  enrichRosterUser: vi.fn().mockResolvedValue({ generatedId: null }),
}));
// Only `requireAuth` is stubbed — `requireRoles` / `canAssignRole` stay real so
// the route's own gates still run.
vi.mock('@/lib/auth/context', async (importOriginal) => {
  const actual = await (importOriginal() as Promise<Record<string, unknown>>);
  return { ...actual, requireAuth: h.requireAuth };
});
vi.mock('@quikit/database', () => ({
  db: {
    user: { findUnique: h.userFindUnique, create: h.userCreate, update: vi.fn() },
    orgMember: { findUnique: h.memberFindUnique, create: h.memberCreate, update: h.memberUpdate },
    app: { findUnique: h.appFindUnique },
    userAppAccess: { upsert: h.accessUpsert },
    org: { findUnique: h.orgFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsUser: {
      findUnique: h.lmsUserFindUnique,
      findFirst: h.lmsUserFindFirst,
      create: h.lmsUserCreate,
    },
    lmsUserAppRole: { count: h.appRoleCount },
    $transaction: h.transaction,
  },
}));

import { provisionLmsUser } from '@/lib/services/identity-service';
import { POST } from '@/app/api/auth/register/route';

const base = {
  email: 'leo@acme.test',
  firstName: 'Leo',
  lastName: 'Learner',
  orgId: 'org-1',
  lmsRole: 'LEARNER',
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());

  h.requireAuth.mockResolvedValue({
    id: 'admin-1',
    role: 'TENANT_ADMIN',
    orgId: 'org-1',
    isSuperAdmin: false,
    firstName: 'Corp',
    lastName: 'Admin',
    tenantType: 'corporate',
  });

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
  h.orgFindUnique.mockResolvedValue({ name: 'Acme Corp' });
  h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' });
  h.appRoleCount.mockResolvedValue(1);
  h.lmsUserFindUnique.mockResolvedValue(null);
  h.lmsUserFindFirst.mockResolvedValue(null);
  h.lmsUserCreate.mockResolvedValue({ id: 'u-new' });

  // The default: a configured transport that accepts the message.
  h.sendEmail.mockResolvedValue({ messageId: 'm1' });
});

function registerRequest(body: unknown) {
  return new Request('http://localhost:3014/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('the identity service reports what actually happened to the mail', () => {
  it('reports it sent when the transport accepted the message', async () => {
    const out = await provisionLmsUser({ ...base });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(out.invitationEmailed).toBe(true);
    expect(out.invitationEmailError).toBeNull();
  });

  it('reports NOT sent when no mail transport is configured', async () => {
    // `sendEmail`'s documented signal for "no SMTP_HOST and no RESEND_API_KEY".
    // It resolves — it does not reject — which is exactly why ignoring the
    // return value made an unsent invitation look delivered.
    h.sendEmail.mockResolvedValue(null);

    const out = await provisionLmsUser({ ...base });
    expect(out.invitationEmailed).toBe(false);
    expect(out.invitationEmailError).toMatch(/transport/i);
  });

  it('reports NOT sent when the transport rejects the message', async () => {
    h.sendEmail.mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful'));

    const out = await provisionLmsUser({ ...base });
    expect(out.invitationEmailed).toBe(false);
    expect(out.invitationEmailError).toContain('535');
  });

  it('still provisions the account when the mail does not go — a mail outage costs nobody their row', async () => {
    h.sendEmail.mockResolvedValue(null);

    const out = await provisionLmsUser({ ...base });
    expect(out.userId).toBe('u-new');
    expect(h.userCreate).toHaveBeenCalled();
    expect(h.lmsUserCreate).toHaveBeenCalled();
  });

  it('reports NOT sent — not a phantom success — when the caller suppressed the email', async () => {
    const out = await provisionLmsUser({ ...base, skipEmail: true });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(out.invitationEmailed).toBe(false);
  });
});

describe('POST /api/auth/register tells the admin the truth', () => {
  /** The body the Learners roster now posts — no `password` field at all. */
  const rosterBody = {
    email: 'leo@acme.test',
    firstName: 'Leo',
    lastName: 'Learner',
    role: 'LEARNER',
    orgId: 'org-1',
  };

  async function post(body: unknown) {
    // `route()` hands the handler (req, ctx) — this route reads no dynamic
    // segments, so an empty params bag is the whole context it needs.
    const res = (await POST(registerRequest(body), { params: {} })) as Response;
    return { status: res.status, body: await res.json() };
  }

  it('creates the learner with NO password in the body — invitation is the mechanism', async () => {
    const { status, body } = await post(rosterBody);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(h.lmsUserCreate).toHaveBeenCalled();
  });

  it('says credentials were emailed only when they actually were', async () => {
    const { body } = await post(rosterBody);
    expect(body.data.credentialsEmailed).toBe(true);
    expect(body.data.invitationEmailError).toBeNull();
  });

  it('says credentials were NOT emailed when the server has no mail transport', async () => {
    // THE REGRESSION. `credentialsEmailed` used to be `tempPassword != null`, so
    // this asserted `true` — a server that sent nothing reported a delivery, and
    // the roster UI told the admin the learner had been invited.
    h.sendEmail.mockResolvedValue(null);

    const { status, body } = await post(rosterBody);
    expect(status).toBe(201); // the account is still created
    expect(body.data.credentialsEmailed).toBe(false);
    expect(body.data.invitationEmailError).toMatch(/transport/i);
  });

  it('says credentials were NOT emailed when SMTP rejects the message', async () => {
    h.sendEmail.mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful'));

    const { body } = await post(rosterBody);
    expect(body.data.credentialsEmailed).toBe(false);
    expect(body.data.invitationEmailError).toContain('535');
  });

  it('never echoes the temp password back to the browser', async () => {
    const { body } = await post(rosterBody);
    expect(body.data.tempPassword).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/password.{0,4}:.{0,4}"[^"]{6,}"/i);
  });
});
