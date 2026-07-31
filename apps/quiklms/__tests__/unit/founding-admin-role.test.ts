/**
 * The founding admin of an org is its top-tier admin — and that is a UI/role fact,
 * not a data-scope fact.
 *
 * THE BUG. A platform admin creates a new org in QuikIT and invites its first
 * administrator. QuikIT's invite form (`POST /api/super/orgs/[id]/members`) can
 * only send membershipRole `"org_admin" | "member"`, so that person arrives
 * indistinguishable from the org's fifth admin, resolved to `TENANT_ADMIN`, and
 * landed on `/tenant-dashboard` — the CORPORATE tenant-admin dashboard, with the
 * "Admin" chip. Reported as "invited an admin for a new org, logged in as corporate
 * admin, it must log in as admin".
 *
 * THE FIX, AND ITS BOUNDARY. `mapPlatformRoleToLmsRole` now promotes the org's
 * founding admin to `SUPER_ADMIN`, which drives the dashboard, the nav and the page
 * guards. The second half of these tests pins the boundary that makes that safe:
 * `SUPER_ADMIN`-by-role must NOT confer cross-tenant data access. Every scoping
 * decision keys on the platform operator claim `isSuperAdmin`, which only
 * apps/quikit's audited super-admin console can set.
 *
 * Without that second half this change would re-open the leak recorded in
 * lib/auth/role-resolution.ts, where 52 `org_admin` memberships resolved to
 * SUPER_ADMIN and read every tenant's courses, users and certificates.
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
import {
  getFoundingAdminUserId,
  isFoundingOrgAdmin,
  resolveCentralMembership,
  _clearFoundingAdminCache,
  _clearCentralMembershipCache,
} from '@/lib/auth/founding-admin';
import { assertTenantMatch, orgScope, tenantWhere, type AuthUser } from '@/lib/auth/context';

beforeEach(() => {
  h.orgMemberFindFirst.mockReset();
  _clearFoundingAdminCache();
  _clearCentralMembershipCache();
});

/** A session user, defaulting to the shape that caused the bug. */
function actor(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'founder',
    email: 'founder@acme.test',
    role: 'SUPER_ADMIN',
    secondaryRole: null,
    roles: ['SUPER_ADMIN'],
    orgId: 'org-acme',
    tenantType: 'corporate',
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
    // The founding admin is NOT a platform operator — QuikIT only sets this on
    // real operators, and the OIDC path zeroes it for consumer apps anyway.
    isSuperAdmin: false,
    ...over,
  };
}

describe('the founding admin gets the top tier', () => {
  it('promotes a founding org_admin to SUPER_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, true)).toBe('SUPER_ADMIN');
  });

  it('leaves a later org_admin on TENANT_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, false)).toBe('TENANT_ADMIN');
  });

  it('leaves org_admin on TENANT_ADMIN when the signal is not supplied', () => {
    // Callers that cannot resolve the fact must not accidentally promote anyone.
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('TENANT_ADMIN');
  });

  it('treats the owner/administrator aliases identically', () => {
    for (const r of ['owner', 'administrator', 'ORG-ADMIN', 'Org Admin']) {
      expect(mapPlatformRoleToLmsRole(r, false, true)).toBe('SUPER_ADMIN');
      expect(mapPlatformRoleToLmsRole(r, false, false)).toBe('TENANT_ADMIN');
    }
  });

  it('never promotes a non-admin membership role, founding or not', () => {
    // Being row #1 in an org is not authority. Only admin-tier roles are eligible.
    expect(mapPlatformRoleToLmsRole('member', false, true)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('teacher', false, true)).toBe('TEACHER');
    expect(mapPlatformRoleToLmsRole('app_admin', false, true)).toBe('SUB_ADMIN');
    expect(mapPlatformRoleToLmsRole('manager', false, true)).toBe('MANAGER');
  });

  it('still honours the isSuperAdmin claim above everything', () => {
    expect(mapPlatformRoleToLmsRole('member', true, false)).toBe('SUPER_ADMIN');
  });
});

describe('who counts as the founding admin', () => {
  it('is the earliest admin-tier OrgMember, tie-broken deterministically', async () => {
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'first-admin' });
    expect(await getFoundingAdminUserId('org-acme')).toBe('first-admin');

    const [[args]] = h.orgMemberFindFirst.mock.calls;
    expect(args.where.orgId).toBe('org-acme');
    expect(args.where.role.in).toContain('org_admin');
    // createdAt alone is not a total order — orgs provisioned in one transaction
    // share a timestamp, and a non-deterministic founder would flip the role
    // between requests.
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('excludes non-admin memberships from the search', async () => {
    h.orgMemberFindFirst.mockResolvedValue(null);
    await getFoundingAdminUserId('org-acme');
    const [[args]] = h.orgMemberFindFirst.mock.calls;
    expect(args.where.role.in).not.toContain('member');
    expect(args.where.role.in).not.toContain('learner');
  });

  it('answers false for a different user in the same org', async () => {
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'first-admin' });
    expect(await isFoundingOrgAdmin('someone-else', 'org-acme')).toBe(false);
  });

  it('answers false — never throws — when the lookup fails', async () => {
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));
    expect(await isFoundingOrgAdmin('founder', 'org-acme')).toBe(false);
  });

  it('does not cache a failed lookup', async () => {
    // A transient fault must not pin an org to "no founder" for the whole TTL.
    h.orgMemberFindFirst.mockRejectedValueOnce(new Error('timeout'));
    expect(await getFoundingAdminUserId('org-acme')).toBeNull();
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'first-admin' });
    expect(await getFoundingAdminUserId('org-acme')).toBe('first-admin');
  });

  it('caches a successful lookup instead of re-querying per request', async () => {
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'first-admin' });
    await getFoundingAdminUserId('org-acme');
    await getFoundingAdminUserId('org-acme');
    expect(h.orgMemberFindFirst).toHaveBeenCalledTimes(1);
  });

  it('needs no query at all without an orgId', async () => {
    expect(await isFoundingOrgAdmin('founder', null)).toBe(false);
    expect(h.orgMemberFindFirst).not.toHaveBeenCalled();
  });
});

/**
 * THE SSO REGRESSION. `resolveCentralMembership` exists because the OIDC path's
 * `membershipRole` claim is not trustworthy: QuikIT's token endpoint builds it as
 * `membership?.role ?? "member"` filtered on `status: "active"`, so an admin whose
 * invitation had not flipped to active when their token was minted arrives claiming
 * `"member"` — LEARNER — and the claim is never re-read for the session's 7 days.
 */
describe('the central OrgMember row beats the session claim', () => {
  it('reports the real org role even when the claim would say "member"', async () => {
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'founder', role: 'org_admin' });
    const m = await resolveCentralMembership('founder', 'org-acme');
    expect(m.role).toBe('org_admin');
    expect(m.isFounding).toBe(true);
  });

  it('is NOT filtered on membership status', async () => {
    // Gating this read on `active` is the exact mistake that produced "member" in
    // the id_token. An invited-but-unaccepted admin is still an admin; whether they
    // may open the app at all is `hasCentralAppAccess`'s job, not this function's.
    h.orgMemberFindFirst.mockResolvedValue({ userId: 'founder', role: 'org_admin' });
    await resolveCentralMembership('founder', 'org-acme');
    const roleQuery = h.orgMemberFindFirst.mock.calls.find(
      ([a]) => a?.where?.userId === 'founder',
    );
    expect(roleQuery).toBeDefined();
    expect(roleQuery![0].where).not.toHaveProperty('status');
  });

  it('an SSO-invited founding admin resolves SUPER_ADMIN despite a "member" claim', () => {
    // The end-to-end shape: central row says org_admin + founding, claim says member.
    // The central row is passed to the mapping, so the landing is /dashboard, not
    // /learner/dashboard.
    const centralRole = 'org_admin';
    const claim = 'member';
    expect(mapPlatformRoleToLmsRole(centralRole ?? claim, false, true)).toBe('SUPER_ADMIN');
    // ...and the claim alone is what produced the learner dashboard.
    expect(mapPlatformRoleToLmsRole(claim, false, true)).toBe('LEARNER');
  });

  it('returns role:null on a failed read so the caller keeps using the claim', async () => {
    h.orgMemberFindFirst.mockRejectedValue(new Error('central DB unavailable'));
    const m = await resolveCentralMembership('founder', 'org-acme');
    expect(m.role).toBeNull();
    expect(m.isFounding).toBe(false);
  });

  it('needs no query without a userId or orgId', async () => {
    expect(await resolveCentralMembership('founder', null)).toEqual({ role: null, isFounding: false });
    expect(await resolveCentralMembership(null, 'org-acme')).toEqual({ role: null, isFounding: false });
    expect(h.orgMemberFindFirst).not.toHaveBeenCalled();
  });
});

/**
 * The boundary. A founding admin carries `role: 'SUPER_ADMIN'` with
 * `isSuperAdmin: false` — the exact shape that would have leaked under the old
 * role-keyed guards.
 */
describe('SUPER_ADMIN by role does not confer cross-tenant access', () => {
  it('tenantWhere still filters a founding admin to their own org', () => {
    expect(tenantWhere(actor(), { id: 'c1' })).toEqual({ id: 'c1', orgId: 'org-acme' });
  });

  it('tenantWhere unscopes only for the real platform operator', () => {
    expect(tenantWhere(actor({ isSuperAdmin: true }), { id: 'c1' })).toEqual({ id: 'c1' });
  });

  it('assertTenantMatch REJECTS a founding admin reaching into another org', () => {
    // Regression: this guard short-circuited on `role === 'SUPER_ADMIN'`, so every
    // fetch-by-id skipped the org check for anyone whose ROLE resolved to it.
    expect(() => assertTenantMatch(actor(), 'org-other')).toThrow(/cross-tenant/i);
  });

  it('assertTenantMatch allows a founding admin inside their own org', () => {
    expect(() => assertTenantMatch(actor(), 'org-acme')).not.toThrow();
  });

  it('assertTenantMatch still lets the platform operator through', () => {
    expect(() => assertTenantMatch(actor({ isSuperAdmin: true }), 'org-other')).not.toThrow();
  });

  it('orgScope pins a founding admin to their org, unscopes the operator', () => {
    // Backs the /api/users, /api/users/search, /api/users/:id and
    // .../toggle-active handlers, which pass this straight into their services.
    expect(orgScope(actor())).toBe('org-acme');
    expect(orgScope(actor({ isSuperAdmin: true }))).toBeUndefined();
  });
});
