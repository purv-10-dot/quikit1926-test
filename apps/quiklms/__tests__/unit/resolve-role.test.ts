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
import { _clearCentralMembershipCache } from '@/lib/auth/founding-admin';

beforeEach(() => {
  h.userFindUnique.mockReset();
  h.tenantFindUnique.mockReset();
  h.appRoleFindFirst.mockReset();
  h.orgMemberFindFirst.mockReset();
  // No platform-assigned app role unless a test says otherwise.
  h.appRoleFindFirst.mockResolvedValue(null);
  _clearCentralMembershipCache();
});

/**
 * The landing redirect must agree with the API guards: prefer the platform-assigned
 * app role, then the LMS row's fine-grained role, then the coarse membership
 * mapping.
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
   * app-role assignment on their first login, so they land on this coarse fallback.
   * Every org_admin resolves ADMIN now — quikscale parity (removed 2026-08-04) —
   * first invite or fifth.
   */
  it('resolves an org_admin with no LMS row to ADMIN', async () => {
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ role: 'org_admin' });
    const role = await resolveLmsRole({
      id: 'org-admin-1',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('ADMIN');
  });

  it('resolves a SECOND org_admin of the same org to ADMIN too', async () => {
    // Quikscale parity: there is no "who was first" concept. Both admins in the
    // same org resolve ADMIN.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ role: 'org_admin' });
    const role = await resolveLmsRole({
      id: 'second-admin',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('ADMIN');
  });

  it('does not promote a plain member, regardless of the central row', async () => {
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue({ role: 'member' });
    const role = await resolveLmsRole({
      id: 'u1',
      orgId: 'org1',
      membershipRole: 'member',
      isSuperAdmin: false,
    });
    expect(role).toBe('LEARNER');
  });

  it('falls back to the claim (still ADMIN) when the central lookup fails', async () => {
    // Fail-safe direction: the central read failing never demotes an org_admin
    // claim to LEARNER — it falls back to mapping the claim itself, which still
    // resolves ADMIN.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));
    const role = await resolveLmsRole({
      id: 'u1',
      orgId: 'org1',
      membershipRole: 'org_admin',
      isSuperAdmin: false,
    });
    expect(role).toBe('ADMIN');
  });

  it('resolves the platform operator to ADMIN from the isSuperAdmin claim', async () => {
    // The operator is identified by the claim, never inferred — no OrgMember read
    // is even needed.
    h.userFindUnique.mockResolvedValue(null);
    h.orgMemberFindFirst.mockResolvedValue(null);
    const role = await resolveLmsRole({ id: 'op', orgId: 'op-org', membershipRole: 'org_admin', isSuperAdmin: true });
    expect(role).toBe('ADMIN');
  });

  // Note: the "LMS DB unavailable → fall back to mapping" catch path is
  // exercised deterministically in auth-context-tenant.test.ts (which uses
  // Promise.allSettled and can assert a rejected lookup without tripping
  // vitest 4's unhandled-rejection guard). resolveLmsRole's try/catch is the
  // same defensive shape.
});
