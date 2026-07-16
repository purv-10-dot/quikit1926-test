import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
  },
}));

import { getAuthContext } from '@/lib/auth/context';

const sessionFor = (membershipRole: string) => ({
  user: {
    id: 'u1',
    orgId: 'org1',
    email: 'a@b.com',
    membershipRole,
    isSuperAdmin: false,
    firstName: 'A',
    lastName: 'B',
  },
});

beforeEach(() => {
  h.getServerSession.mockReset();
  h.userFindUnique.mockReset();
  h.tenantFindUnique.mockReset();
});

describe('getAuthContext — operator role + tenantType', () => {
  it('resolves the operator (org_admin, no LMS row) to SUPER_ADMIN with null tenantType', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null); // operator has no LMS row
    h.tenantFindUnique.mockResolvedValue(null); // operator org has no Tenant row

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('SUPER_ADMIN');
    expect(ctx?.tenantType).toBeNull();
  });

  it('resolves a school tenant admin to TENANT_ADMIN with tenantType "school"', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TENANT_ADMIN', secondaryRole: null, isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'school' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TENANT_ADMIN'); // LMS row wins over the coarse mapping
    expect(ctx?.tenantType).toBe('school');
  });

  it('surfaces tenantType "corporate" so server-side role filtering can fire', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TENANT_ADMIN', secondaryRole: null, isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' });

    const ctx = await getAuthContext();
    expect(ctx?.tenantType).toBe('corporate');
  });

  it('a failing tenant lookup does not break user/role resolution', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', secondaryRole: null, isActive: true });
    h.tenantFindUnique.mockRejectedValue(new Error('tenant db down'));

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx?.tenantType).toBeNull();
    expect(ctx?.isActive).toBe(true);
  });
});
