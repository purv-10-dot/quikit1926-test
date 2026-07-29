import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  orgMemberFindFirst: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    // The coarse fallback asks whether the actor is the org's FOUNDING admin.
    orgMember: { findFirst: h.orgMemberFindFirst },
  },
}));
// `lib/auth/context` imports the central entitlement gate, which transitively
// pulls in `@quikit/database` and constructs a real PrismaClient at module load
// (no DATABASE_URL in the test env → constructor throws before any test runs).
// `getAuthContext` itself does NOT call the gate — only `requireAuth` does — so
// stubbing it here purely severs that import chain.
vi.mock('@/lib/auth/central-access', () => ({ hasCentralAppAccess: vi.fn().mockResolvedValue(true) }));

import { getAuthContext } from '@/lib/auth/context';
// Clears BOTH central-membership caches (the actor's role and the org's founder).
import { _clearCentralMembershipCache } from '@/lib/auth/founding-admin';

const sessionFor = (membershipRole: string, over: Record<string, unknown> = {}) => ({
  user: {
    id: 'u1',
    orgId: 'org1',
    email: 'a@b.com',
    membershipRole,
    isSuperAdmin: false,
    firstName: 'A',
    lastName: 'B',
    ...over,
  },
});

beforeEach(() => {
  h.getServerSession.mockReset();
  h.userFindUnique.mockReset();
  h.tenantFindUnique.mockReset();
  h.orgMemberFindFirst.mockReset();
  h.orgMemberFindFirst.mockResolvedValue(null); // not the founding admin by default
  _clearCentralMembershipCache();
});

describe('getAuthContext — operator role + tenantType', () => {
  it('resolves the operator to SUPER_ADMIN with null tenantType', async () => {
    // The operator is identified by the `isSuperAdmin` claim, never inferred.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin', { isSuperAdmin: true }));
    h.userFindUnique.mockResolvedValue(null); // operator has no LMS row
    h.tenantFindUnique.mockResolvedValue(null); // operator org has no Tenant row

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('SUPER_ADMIN');
    expect(ctx?.tenantType).toBeNull();
  });

  it('resolves an org FOUNDING admin (org_admin, no LMS row) to SUPER_ADMIN', async () => {
    // The freshly-invited admin of a new org: no LMS row, no assignment, and the
    // earliest admin-tier membership in the org. Was TENANT_ADMIN → landed on the
    // corporate /tenant-dashboard.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' });
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'u1' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('SUPER_ADMIN');
    // ...but their tenant context is still their OWN org, and the platform flag
    // stays false — so `tenantWhere` keeps filtering them to org1.
    expect(ctx?.tenantType).toBe('corporate');
    expect(ctx?.isSuperAdmin).toBe(false);
    expect(ctx?.orgId).toBe('org1');
  });

  it('resolves a NON-founding org_admin (no LMS row) to TENANT_ADMIN', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' });
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'somebody-else' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TENANT_ADMIN');
  });

  /**
   * THE SSO BUG, end to end. Verified against the dev database: the invited admin of
   * a brand-new org has `OrgMember.role = 'org_admin'` and NO LmsUser row and NO
   * UserAppRole — so the coarse fallback is the only thing deciding their role. On
   * the OIDC path the `membershipRole` CLAIM arrives as the literal "member",
   * because QuikIT's token endpoint builds it as `membership?.role ?? "member"`
   * filtered on `status: "active"`. That mapped to LEARNER and dropped them on
   * `/learner/dashboard`, and the claim is never re-read for the session's 7 days.
   */
  it('ignores a "member" claim when the central row says org_admin (SSO regression)', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('member')); // ← the bad claim
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue(null);
    // The actor's own row, then the org's founding admin — both are this user.
    h.orgMemberFindFirst.mockImplementation(async (args: { where?: { userId?: string } }) =>
      args?.where?.userId === 'u1' ? { role: 'org_admin' } : { userId: 'u1' },
    );

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('SUPER_ADMIN'); // was LEARNER → /learner/dashboard
    expect(ctx?.isSuperAdmin).toBe(false); // still org-scoped
  });

  it('falls back to the claim when the central row cannot be read', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));

    const ctx = await getAuthContext();
    // Claim honoured, founding unknown → the org-scoped tier, never a silent demotion
    // to LEARNER and never an unearned promotion.
    expect(ctx?.role).toBe('TENANT_ADMIN');
  });

  it('does not query for a founding admin when an LMS row already answered', async () => {
    // The lookup is lazy on purpose — it must not land on the hot path for the
    // ~335-file majority who already have a row.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', secondaryRole: null, isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'school' });

    await getAuthContext();
    expect(h.orgMemberFindFirst).not.toHaveBeenCalled();
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
