import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the session + the DB dependency getAuthContext reads.
const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: h.userFindUnique } },
}));

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
});

describe('requireAuth — isActive enforcement', () => {
  it('rejects a deactivated LMS user with 403 even though the session is valid', async () => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', secondaryRole: null, isActive: false });

    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows an active LMS user', async () => {
    h.getServerSession.mockResolvedValue(session);
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', secondaryRole: null, isActive: true });

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
