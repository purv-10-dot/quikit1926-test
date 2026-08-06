import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  appRoleFindFirst: vi.fn(),
  orgMemberFindFirst: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsUserAppRole: { findFirst: h.appRoleFindFirst },
    orgMember: { findFirst: h.orgMemberFindFirst },
  },
}));

import { resolveLmsRole } from '@/lib/auth/resolve-role';
import { _clearFoundingAdminCache } from '@/lib/auth/founding-admin';

beforeEach(() => {
  h.userFindUnique.mockReset();
  h.tenantFindUnique.mockReset();
  h.appRoleFindFirst.mockReset();
  h.orgMemberFindFirst.mockReset();
  // No platform-assigned app role unless a test says otherwise.
  h.appRoleFindFirst.mockResolvedValue(null);
  _clearFoundingAdminCache();
});

/**
 * The landing redirect must agree with the API guards: prefer the platform-assigned
 * app role, then the LMS row's fine-grained role, then the coarse membership
 * mapping — and on that last path, distinguish an org's FOUNDING admin from a
 * later one.
 */
describe('resolveLmsRole', () => {
  it('prefers the LMS User.role row over the coarse membership role', async () => {
    // A roster TEACHER carries membershipRole "member" but must NOT land on the
    // learner dashboard — the LMS row wins.
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER' });
    const role = await resolveLmsRole({ id: 'u1', membershipRole: 'member', isSuperAdmin: false });
    expect(role).toBe('TEACHER');
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * QuikIT invites the admin of a brand-new org with membershipRole `org_admin`
   * (its form offers only `org_admin | member`). That person has no LMS row and no
   * app-role assignment on their first login, so they land on this coarse fallback
   * — and they were resolved TENANT_ADMIN, which `landingPathFor` sends to
   * `/tenant-dashboard`, the CORPORATE tenant-admin dashboard. Reported as
   * "invited an admin for a new org, logged in as corporate admin".
   */
  it('resolves the FOUNDING admin of an org to SUPER_ADMIN', async () => {
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'founder' });
    const role = await resolveLmsRole({
      id: 'founder',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('SUPER_ADMIN');
  });

  it('resolves a LATER org_admin of the same org to TENANT_ADMIN', async () => {
    // Same org, but the founding admin is somebody else — the second admin is an
    // ordinary tenant admin and lands on /tenant-dashboard as before.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'founder' });
    const role = await resolveLmsRole({
      id: 'second-admin',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('TENANT_ADMIN');
  });

  it('does not promote a plain member who happens to be the org\'s first row', async () => {
    // The founding-admin signal only ever upgrades an ADMIN-tier membership role.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'u1' });
    const role = await resolveLmsRole({
      id: 'u1',
      orgId: 'org1',
      membershipRole: 'member',
      isSuperAdmin: false,
    });
    expect(role).toBe('LEARNER');
  });

  it('degrades to TENANT_ADMIN when the founding-admin lookup fails', async () => {
    // Fail-safe direction: never mint the top tier off a failed read.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));
    const role = await resolveLmsRole({
      id: 'u1',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('TENANT_ADMIN');
  });

  it('resolves the platform operator to SUPER_ADMIN from the isSuperAdmin claim', async () => {
    // The operator is identified by the claim, never inferred — no OrgMember read
    // is even needed.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue(null);
    const role = await resolveLmsRole({ id: 'op', orgId: 'op-org', membershipRole: 'org_admin', isSuperAdmin: true });
    expect(role).toBe('SUPER_ADMIN');
  });

  // Note: the "LMS DB unavailable → fall back to mapping" catch path is
  // exercised deterministically in auth-context-tenant.test.ts (which uses
  // Promise.allSettled and can assert a rejected lookup without tripping
  // vitest 4's unhandled-rejection guard). resolveLmsRole's try/catch is the
  // same defensive shape.
});
