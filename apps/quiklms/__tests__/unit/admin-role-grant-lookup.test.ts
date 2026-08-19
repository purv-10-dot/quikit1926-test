import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * REGRESSION — ADMIN was refused every request that fell through to the
 * role-grant fallback, including `POST /api/tenants/onboard`:
 *
 *     Access denied. Requires tenants.onboard:create — your role (ADMIN) has no
 *     such grant.
 *
 * ...despite the matrix granting `tenants.onboard: { create: ['ADMIN'] }`.
 *
 * THE FAULT. Grants live on `AppRole`, whose NAME is not the enum value for the
 * top tier: every writer stores it through `lmsRoleToAppRoleName`, which maps
 * `ADMIN` → `admin` (the platform-standard `isSystem` row every QuikIT app
 * seeds) and leaves the other six untouched. `requireAuth`'s fallback was the one
 * READER that skipped that mapping and passed the raw enum, so `loadRoleGrants`
 * searched for a catalogue row named `ADMIN`, found none, and returned []. Since
 * grants are the gate, an empty set refuses everything.
 *
 * Only ADMIN was affected — the other six enum names equal their catalogue names,
 * which is exactly why this surfaced as an ADMIN-only fault and why a test that
 * only exercises, say, TEACHER would have stayed green through the whole bug.
 *
 * The assertion is on the NAME HANDED TO THE LOOKUP, not on a boolean outcome: a
 * test that merely asserts "ADMIN may onboard" passes just as well if someone
 * later reintroduces a blanket operator bypass, which is the thing the fallback's
 * own doc comment explicitly refuses to do.
 */

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  orgMemberFindFirst: vi.fn(),
  loadMyPermissions: vi.fn(),
  loadRoleGrants: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    orgMember: { findFirst: h.orgMemberFindFirst },
  },
}));
// Severs the `@quikit/database` import chain — it builds a real PrismaClient at
// module load and there is no DATABASE_URL in the test env.
vi.mock('@/lib/auth/central-access', () => ({
  hasCentralAppAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth/permissions', () => ({
  loadMyPermissions: h.loadMyPermissions,
  loadRoleGrants: h.loadRoleGrants,
}));

import { requireAuth, requireRoles } from '@/lib/auth/context';
import { _clearCentralMembershipCache } from '@/lib/auth/founding-admin';
import { LMS_SYSTEM_ADMIN_ROLE } from '@/lib/api/seed-lms-app-roles';

/** A POST to the onboarding route — the request the bug report came from. */
const onboardRequest = () =>
  ({
    method: 'POST',
    url: 'http://localhost:3016/api/tenants/onboard',
  }) as unknown as Parameters<typeof requireAuth>[0];

beforeEach(() => {
  vi.clearAllMocks();
  _clearCentralMembershipCache();

  // The platform operator: an ADMIN with no LMS row and no UserAppRole
  // assignment, which is what drives execution into the role-grant fallback.
  h.getServerSession.mockResolvedValue({
    user: {
      id: 'u1',
      orgId: 'org1',
      email: 'operator@quikit.io',
      membershipRole: 'org_admin',
      isSuperAdmin: true,
      firstName: 'Op',
      lastName: 'Erator',
    },
  });
  h.userFindUnique.mockResolvedValue(null);
  h.tenantFindUnique.mockResolvedValue(null);
  h.orgMemberFindFirst.mockResolvedValue(null);

  // No assignment row → empty permission set → the fallback runs.
  h.loadMyPermissions.mockResolvedValue({
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    extras: [],
  });
  h.loadRoleGrants.mockResolvedValue([]);
});

describe('requireAuth — role-grant fallback role-name mapping', () => {
  it('looks grants up by the CATALOGUE name (admin), not the enum value (ADMIN)', async () => {
    const actor = await requireAuth(onboardRequest());
    expect(actor.role).toBe('ADMIN');

    expect(h.loadRoleGrants).toHaveBeenCalledWith('org1', LMS_SYSTEM_ADMIN_ROLE);
    // Pinned literally too: if `LMS_SYSTEM_ADMIN_ROLE` is ever changed to the enum
    // value, the assertion above would follow it and stop protecting anything.
    expect(h.loadRoleGrants).toHaveBeenCalledWith('org1', 'admin');
    expect(h.loadRoleGrants).not.toHaveBeenCalledWith('org1', 'ADMIN');
  });

  it('admits ADMIN to tenants.onboard:create once the catalogue row resolves', async () => {
    // Name-SENSITIVE, the way the query is: `loadRoleGrants` filters on
    // `AppRole.name`, so a lookup by the wrong name returns no rows. A mock that
    // ignored its argument would keep this green under the very bug it covers.
    h.loadRoleGrants.mockImplementation(async (_orgId: string, roleName: string) =>
      roleName === LMS_SYSTEM_ADMIN_ROLE ? ['tenants.onboard:create', 'tenants:create'] : [],
    );

    const actor = await requireAuth(onboardRequest());
    // The exact guard `app/api/tenants/onboard/route.ts` runs.
    expect(() => requireRoles(actor, ['ADMIN'])).not.toThrow();
  });

  it('still fails CLOSED when the org has no seeded grants', async () => {
    // The second half of the reported failure: with zero `LmsRolePermission` rows
    // for the org, the correct name resolves to an empty set and ADMIN is refused.
    // Fixing the lookup must not paper over an unseeded org.
    h.loadRoleGrants.mockResolvedValue([]);

    const actor = await requireAuth(onboardRequest());
    expect(() => requireRoles(actor, ['ADMIN'])).toThrow(/tenants\.onboard:create/);
  });

  it('leaves the six roles whose enum and catalogue names already match alone', async () => {
    // TENANT_ADMIN is stored under its own enum name, so the mapping is identity.
    // This is the half of the matrix that worked throughout the bug.
    h.getServerSession.mockResolvedValue({
      user: {
        id: 'u2',
        orgId: 'org1',
        email: 'ta@school.test',
        membershipRole: 'admin',
        isSuperAdmin: false,
        firstName: 'T',
        lastName: 'A',
      },
    });
    h.orgMemberFindFirst.mockResolvedValue({ role: 'admin' });

    const actor = await requireAuth(onboardRequest());
    expect(actor.role).toBe('TENANT_ADMIN');
    expect(h.loadRoleGrants).toHaveBeenCalledWith('org1', 'TENANT_ADMIN');
  });
});
