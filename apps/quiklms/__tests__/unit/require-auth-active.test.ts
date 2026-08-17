import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the session + the DB dependency getAuthContext reads.
const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  hasCentralAppAccess: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  db: { lmsUser: { findUnique: h.userFindUnique } },
}));
// The central entitlement gate is stubbed rather than exercised: the real one
// pulls in `@quikit/database` (a real PrismaClient at module load, which the
// test env has no DATABASE_URL for). Its own rule is the shared
// `createGetOrgId` factory, covered by `packages/auth`'s tests — what matters
// HERE is that `requireAuth` honours its verdict, asserted below.
vi.mock('@/lib/auth/central-access', () => ({ hasCentralAppAccess: h.hasCentralAppAccess }));

import { requireAuth } from '@/lib/auth/context';

const session = {
  user: {
    id: 'u1',
    orgId: 'org1',
    email: 'a@b.com',
    membershipRole: 'member',
    isSuperAdmin: false,
    firstName: 'A',
    lastName: 'B',
  },
};

beforeEach(() => {
  h.getServerSession.mockReset();
  h.userFindUnique.mockReset();
  h.hasCentralAppAccess.mockReset();
  // Default to entitled so the pre-existing isActive assertions below keep
  // testing what they were written to test.
  h.hasCentralAppAccess.mockResolvedValue(true);
});

describe('requireAuth — isActive enforcement', () => {
  it('rejects a deactivated LMS user with 403 even though the session is valid', async () => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', isActive: false });

    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows an active LMS user', async () => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', isActive: true });

    const user = await requireAuth();
    expect(user.id).toBe('u1');
    expect(user.isActive).toBe(true);
  });

  it('treats a user with no LMS row as active (defaults true, maps coarse role)', async () => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue(null);

    const user = await requireAuth();
    expect(user.isActive).toBe(true);
    expect(user.role).toBe('LEARNER'); // 'member' → LEARNER
  });

  it('rejects an unauthenticated request with 401', async () => {
    h.getServerSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('requireAuth — central entitlement gate', () => {
  beforeEach(() => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', isActive: true });
  });

  it('rejects a user with no QuikLMS entitlement, even with a valid session', async () => {
    h.hasCentralAppAccess.mockResolvedValue(false);

    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects with 403 and NOT 401 — a 401 makes lib/api hard-navigate to /login, which re-runs SSO and loops', async () => {
    h.hasCentralAppAccess.mockResolvedValue(false);

    await expect(requireAuth()).rejects.not.toMatchObject({ statusCode: 401 });
  });

  it('passes the session identity to the gate so it can resolve org + super-admin', async () => {
    await requireAuth();

    expect(h.hasCentralAppAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', orgId: 'org1', isSuperAdmin: false }),
    );
  });

  it('checks isActive BEFORE entitlement — a deactivated user gets the account message', async () => {
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', isActive: false });
    h.hasCentralAppAccess.mockResolvedValue(false);

    await expect(requireAuth()).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('deactivated'),
    });
  });

  it('admits an entitled, active user', async () => {
    h.hasCentralAppAccess.mockResolvedValue(true);

    const user = await requireAuth();
    expect(user.id).toBe('u1');
  });
});
