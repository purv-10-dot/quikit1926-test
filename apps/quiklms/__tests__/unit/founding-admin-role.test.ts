/**
 * Every `org_admin` quikit invites is the LMS's top-tier admin — and that is a
 * UI/role fact, not a data-scope fact.
 *
 * HISTORY. This used to depend on being the org's "founding" admin (the
 * earliest admin-tier `OrgMember` row) — every LATER `org_admin` resolved to
 * `TENANT_ADMIN` instead. That distinction was removed 2026-08-04 for
 * quikscale parity: `org_admin` clears quikscale's admin bar unconditionally,
 * with no "who was first" concept, so quiklms now does the same.
 *
 * THE BOUNDARY THAT MAKES THIS SAFE. The second half of these tests pins that
 * `ADMIN`-by-role must NOT confer cross-tenant data access, now more
 * important than before — potentially many people per org hold `ADMIN`, not
 * just one founder. Every scoping decision keys on the platform operator
 * claim `isSuperAdmin`, which only apps/quikit's audited super-admin console
 * can set. Without this boundary, the change would re-open the leak recorded
 * in lib/auth/role-resolution.ts, where 52 `org_admin` memberships resolved to
 * ADMIN and read every tenant's courses, users and certificates.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ orgMemberFindFirst: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { orgMember: { findFirst: h.orgMemberFindFirst } } }));
// Same import-chain severing as auth-context-tenant.test.ts: `lib/auth/context`
// pulls in the central entitlement gate, which constructs a real PrismaClient at
// module load (no DATABASE_URL in the test env → throws before any test runs).
// None of the pure helpers under test here touch either one.
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth/central-access', () => ({
  hasCentralAppAccess: vi.fn().mockResolvedValue(true),
}));

import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { resolveCentralMembership, _clearCentralMembershipCache } from '@/lib/auth/founding-admin';
import { assertTenantMatch, orgScope, tenantWhere, type AuthUser } from '@/lib/auth/context';

beforeEach(() => {
  h.orgMemberFindFirst.mockReset();
  _clearCentralMembershipCache();
});

/** A session user, defaulting to the shape that caused the bug. */
function actor(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'org-admin-1',
    email: 'admin@acme.test',
    role: 'ADMIN',
    orgId: 'org-acme',
    tenantType: 'corporate',
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
    // An org's ADMIN is NOT a platform operator — QuikIT only sets this on
    // real operators, and the OIDC path zeroes it for consumer apps anyway.
    isSuperAdmin: false,
    ...over,
  };
}

describe('every org_admin gets the top tier', () => {
  it('promotes an org_admin to ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('ADMIN');
  });

  it('treats the owner/administrator aliases identically', () => {
    for (const r of ['owner', 'administrator', 'ORG-ADMIN', 'Org Admin']) {
      expect(mapPlatformRoleToLmsRole(r, false)).toBe('ADMIN');
    }
  });

  it('never promotes a non-admin membership role', () => {
    expect(mapPlatformRoleToLmsRole('member', false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('teacher', false)).toBe('TEACHER');
    expect(mapPlatformRoleToLmsRole('app_admin', false)).toBe('SUB_ADMIN');
    expect(mapPlatformRoleToLmsRole('manager', false)).toBe('MANAGER');
  });

  it('still honours the isSuperAdmin claim above everything', () => {
    expect(mapPlatformRoleToLmsRole('member', true)).toBe('ADMIN');
  });
});

/**
 * THE SSO REGRESSION. `resolveCentralMembership` exists because the OIDC path's
 * `membershipRole` claim is not trustworthy: QuikIT's token endpoint builds it as
 * `membership?.role ?? "member"` filtered on `status: "active"`, so an admin whose
 * invitation had not flipped to active when their token was minted arrives claiming
 * `"member"` — LEARNER — and the claim is never re-read for the session's 7 days.
 * This bug fix is independent of the founding-admin removal above.
 */
describe('the central OrgMember row beats the session claim', () => {
  it('reports the real org role even when the claim would say "member"', async () => {
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'org-admin-1', role: 'org_admin' });
    const m = await resolveCentralMembership('org-admin-1', 'org-acme');
    expect(m.role).toBe('org_admin');
  });

  it('is NOT filtered on membership status', async () => {
    // Gating this read on `active` is the exact mistake that produced "member" in
    // the id_token. An invited-but-unaccepted admin is still an admin; whether they
    // may open the app at all is `hasCentralAppAccess`'s job, not this function's.
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'org-admin-1', role: 'org_admin' });
    await resolveCentralMembership('org-admin-1', 'org-acme');
    const roleQuery = h.orgMemberFindFirst.mock.calls.find(
      ([a]) => a?.where?.userId === 'org-admin-1',
    );
    expect(roleQuery).toBeDefined();
    expect(roleQuery![0].where).not.toHaveProperty('status');
  });

  it('an SSO-invited admin resolves ADMIN despite a "member" claim', () => {
    // The end-to-end shape: central row says org_admin, claim says member. The
    // central row is passed to the mapping, so the landing is /dashboard, not
    // /learner/dashboard.
    const centralRole = 'org_admin';
    const claim = 'member';
    expect(mapPlatformRoleToLmsRole(centralRole ?? claim, false)).toBe('ADMIN');
    // ...and the claim alone is what produced the learner dashboard.
    expect(mapPlatformRoleToLmsRole(claim, false)).toBe('LEARNER');
  });

  it('returns role:null on a failed read so the caller keeps using the claim', async () => {
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));
    const m = await resolveCentralMembership('org-admin-1', 'org-acme');
    expect(m.role).toBeNull();
  });

  it('needs no query without a userId or orgId', async () => {
    expect(await resolveCentralMembership('org-admin-1', null)).toEqual({ role: null });
    expect(await resolveCentralMembership(null, 'org-acme')).toEqual({ role: null });
    expect(h.orgMemberFindFirst).not.toHaveBeenCalled();
  });
});

/**
 * The boundary. An org's ADMIN carries `role: 'ADMIN'` with
 * `isSuperAdmin: false` — the exact shape that would have leaked under the old
 * role-keyed guards, and now applies to potentially many users per org rather
 * than just one founder.
 */
describe('ADMIN by role does not confer cross-tenant access', () => {
  it('tenantWhere still filters an org admin to their own org', () => {
    expect(tenantWhere(actor(), { id: 'c1' })).toEqual({ id: 'c1', orgId: 'org-acme' });
  });

  it('tenantWhere unscopes only for the real platform operator', () => {
    expect(tenantWhere(actor({ isSuperAdmin: true }), { id: 'c1' })).toEqual({ id: 'c1' });
  });

  it('assertTenantMatch REJECTS an org admin reaching into another org', () => {
    // Regression: this guard short-circuited on `role === 'ADMIN'`, so every
    // fetch-by-id skipped the org check for anyone whose ROLE resolved to it.
    expect(() => assertTenantMatch(actor(), 'org-other')).toThrow(/cross-tenant/i);
  });

  it('assertTenantMatch allows an org admin inside their own org', () => {
    expect(() => assertTenantMatch(actor(), 'org-acme')).not.toThrow();
  });

  it('assertTenantMatch still lets the platform operator through', () => {
    expect(() => assertTenantMatch(actor({ isSuperAdmin: true }), 'org-other')).not.toThrow();
  });

  it('orgScope pins an org admin to their org, unscopes the operator', () => {
    // Backs the /api/users, /api/users/search, /api/users/:id and
    // .../toggle-active handlers, which pass this straight into their services.
    expect(orgScope(actor())).toBe('org-acme');
    expect(orgScope(actor({ isSuperAdmin: true }))).toBeUndefined();
  });
});
