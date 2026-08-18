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
    // The coarse fallback reads the actor's live central membership role.
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
  h.orgMemberFindFirst.mockResolvedValue(null); // no central membership row by default
  _clearCentralMembershipCache();
});

describe('getAuthContext — operator role + tenantType', () => {
  it('resolves the operator to ADMIN with null tenantType', async () => {
    // The operator is identified by the `isSuperAdmin` claim, never inferred.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin', { isSuperAdmin: true }));
    h.userFindUnique.mockResolvedValue(null); // operator has no LMS row
    h.tenantFindUnique.mockResolvedValue(null); // operator org has no Tenant row

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('ADMIN');
    expect(ctx?.tenantType).toBeNull();
  });

  /**
   * `org_admin` is AMBIGUOUS, so this branch splits on the org.
   *
   * Both ADMIN and TENANT_ADMIN used to be stored centrally as `org_admin`, and
   * this fallback answered ADMIN for both — promoting a tenant's own admin into the
   * provider's tier, including the shared-catalog approve/reject powers guarded by
   * `assertCanActOnGlobalCourse`. The org is what separates them: an onboarded
   * tenant has an `app_quiklms.tenants` row, a root org does not.
   *
   * This case previously asserted ADMIN here and was labelled "quikscale parity"
   * (2026-08-04, when every org_admin was made ADMIN regardless of who was first).
   * That still holds for a ROOT org — covered by the sibling case below. What
   * changed on 2026-08-11 is the tenant-org half: a tenant admin administers their
   * tenant, not the platform.
   */
  it('resolves an org_admin of a TENANT org to TENANT_ADMIN, not ADMIN', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null); // no LMS row
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' }); // ← tenant org
    h.orgMemberFindFirst.mockResolvedValue({ role: 'org_admin' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TENANT_ADMIN');
    // Their tenant context and scoping are unchanged — the platform flag stays
    // false, so `tenantWhere` keeps filtering them to org1.
    expect(ctx?.tenantType).toBe('corporate');
    expect(ctx?.isSuperAdmin).toBe(false);
    expect(ctx?.orgId).toBe('org1');
  });

  it('resolves an org_admin of a ROOT org to ADMIN — the provider tier', async () => {
    // The other half: an org quikit created has no tenants row, and its admin is
    // the provider. This is the 2026-08-04 "every org_admin is ADMIN" rule, which
    // the tenant-org case above narrows rather than replaces.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue(null); // ← root org, no tenants row
    h.orgMemberFindFirst.mockResolvedValue({ role: 'org_admin' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('ADMIN');
    expect(ctx?.tenantType).toBeNull();
    expect(ctx?.isSuperAdmin).toBe(false);
    expect(ctx?.orgId).toBe('org1');
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
    h.orgMemberFindFirst.mockResolvedValue({ role: 'org_admin' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('ADMIN'); // was LEARNER → /learner/dashboard
    expect(ctx?.isSuperAdmin).toBe(false); // still org-scoped
  });

  it('falls back to the claim when the central row cannot be read', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));

    const ctx = await getAuthContext();
    // Central read failed → falls back to the claim (`org_admin`), which still
    // resolves ADMIN. Never a silent demotion to LEARNER.
    expect(ctx?.role).toBe('ADMIN');
  });

  it('does not query the central membership when an LMS row already answered', async () => {
    // The lookup is lazy on purpose — it must not land on the hot path for the
    // ~335-file majority who already have a row.
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'school' });

    await getAuthContext();
    expect(h.orgMemberFindFirst).not.toHaveBeenCalled();
  });

  it('resolves a school tenant admin to TENANT_ADMIN with tenantType "school"', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TENANT_ADMIN', isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'school' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TENANT_ADMIN'); // LMS row wins over the coarse mapping
    expect(ctx?.tenantType).toBe('school');
  });

  it('surfaces tenantType "corporate" so server-side role filtering can fire', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TENANT_ADMIN', isActive: true });
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'corporate' });

    const ctx = await getAuthContext();
    expect(ctx?.tenantType).toBe('corporate');
  });

  it('a failing tenant lookup does not break user/role resolution', async () => {
    h.getServerSession.mockResolvedValue(sessionFor('org_admin'));
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', isActive: true });
    h.tenantFindUnique.mockRejectedValue(new Error('tenant db down'));

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx?.tenantType).toBeNull();
    expect(ctx?.isActive).toBe(true);
  });
});
