/**
 * Role switching for multi-role users — the regression suite for "a user the
 * tenant admin promoted to Sub Admin cannot switch into the Sub Admin role".
 *
 * WHAT WAS BROKEN. `promoteToSubAdmin` writes `LmsUser.secondaryRole =
 * 'SUB_ADMIN'`, but neither role resolver read that column: `getAuthContext`
 * (API guards) and `resolveLmsRoles` (page guards) went assigned app role →
 * `LmsUser.role` → coarse mapping and stopped. So the header switcher wrote a
 * `qs_role` cookie nothing server-side read, navigated to
 * /sub-admin-dashboard, and `requirePageRoles(['TENANT_ADMIN','SUB_ADMIN'])`
 * resolved TEACHER and bounced the user back to /teacher-dashboard.
 *
 * The tests below are split in two halves on purpose, because the fix has to
 * hold on BOTH sides or the app half-switches:
 *   - the switch works (a held role in the cookie is honoured, by both resolvers)
 *   - the switch is not an override (an UNHELD role in the cookie is ignored)
 *
 * The second half is the security property. The cookie is client-writable, so
 * `qs_role=SUPER_ADMIN` in a learner's browser must change nothing — the same
 * guarantee `__tests__/e2e/ui/phase20-page-gating.spec.ts` asserts end-to-end.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: h.cookieGet }) }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
  },
}));
// `lib/auth/context` imports the central entitlement gate, which transitively
// constructs a real PrismaClient at module load (no DATABASE_URL in the test env).
// `getAuthContext` never calls the gate — only `requireAuth` does — so this stub
// exists purely to sever that import chain.
vi.mock('@/lib/auth/central-access', () => ({ hasCentralAppAccess: vi.fn().mockResolvedValue(true) }));

import { getAuthContext } from '@/lib/auth/context';
import { resolveLmsRoles } from '@/lib/auth/resolve-role';
import { heldRoles, resolveActiveRole } from '@/lib/auth/active-role';

const SESSION_USER = {
  id: 'u1',
  orgId: 'org1',
  email: 'teacher@school.test',
  membershipRole: 'member',
  isSuperAdmin: false,
  firstName: 'T',
  lastName: 'One',
};

/** What the browser is asking to act as; `null` = no cookie set. */
function requestRole(role: string | null) {
  h.cookieGet.mockImplementation((name: string) =>
    name === 'qs_role' && role ? { name, value: role } : undefined,
  );
}

beforeEach(() => {
  h.getServerSession.mockReset().mockResolvedValue({ user: SESSION_USER });
  h.tenantFindUnique.mockReset().mockResolvedValue({ tenantType: 'school' });
  h.cookieGet.mockReset();
  requestRole(null);
  // A teacher the tenant admin promoted to Sub Admin: primary on the row,
  // second role in `secondaryRole` — exactly what `promoteToSubAdmin` leaves.
  h.userFindUnique.mockReset().mockResolvedValue({
    role: 'TEACHER',
    secondaryRole: 'SUB_ADMIN',
    isActive: true,
  });
});

describe('heldRoles / resolveActiveRole', () => {
  it('lists the effective role first so an unswitched user is unaffected', () => {
    expect(heldRoles('TEACHER', 'SUB_ADMIN')).toEqual(['TEACHER', 'SUB_ADMIN']);
    expect(resolveActiveRole(heldRoles('TEACHER', 'SUB_ADMIN'), null)).toBe('TEACHER');
  });

  it('collapses a secondary role that duplicates the primary', () => {
    expect(heldRoles('SUB_ADMIN', 'SUB_ADMIN')).toEqual(['SUB_ADMIN']);
  });

  it('has nothing to switch to when there is no secondary role', () => {
    expect(heldRoles('LEARNER', null)).toEqual(['LEARNER']);
    expect(resolveActiveRole(['LEARNER'], 'TENANT_ADMIN')).toBe('LEARNER');
  });

  it('honours a requested role the user holds, and only that', () => {
    const held = heldRoles('TEACHER', 'SUB_ADMIN');
    expect(resolveActiveRole(held, 'SUB_ADMIN')).toBe('SUB_ADMIN');
    expect(resolveActiveRole(held, 'TENANT_ADMIN')).toBe('TEACHER');
  });
});

describe('the switch works — a held second role is honoured', () => {
  it('getAuthContext resolves the API actor as SUB_ADMIN (was TEACHER: the bug)', async () => {
    requestRole('SUB_ADMIN');

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('SUB_ADMIN');
    expect(ctx?.roles).toEqual(['TEACHER', 'SUB_ADMIN']);
    // The underlying row is untouched — switching is not a promotion.
    expect(ctx?.secondaryRole).toBe('SUB_ADMIN');
  });

  it('resolveLmsRoles lets the page guard into (sub-admin)', async () => {
    requestRole('SUB_ADMIN');

    const { effective, held, active } = await resolveLmsRoles(SESSION_USER);
    expect(active).toBe('SUB_ADMIN');
    expect(effective).toBe('TEACHER');
    expect(held).toEqual(['TEACHER', 'SUB_ADMIN']);
  });

  it('reads secondaryRole even when a platform assignment sets the primary role', async () => {
    // `getAssignedLmsRole` returns null here (the mocked db has no lmsUserAppRole,
    // so its own catch fires) — the point is that the LMS row is still read for
    // `secondaryRole` rather than skipped, which is what hid the second role.
    requestRole('SUB_ADMIN');
    const { held } = await resolveLmsRoles(SESSION_USER);
    expect(held).toContain('SUB_ADMIN');
  });

  it('both resolvers agree, so page and API gating cannot drift', async () => {
    requestRole('SUB_ADMIN');
    const ctx = await getAuthContext();
    const { active } = await resolveLmsRoles(SESSION_USER);
    expect(ctx?.role).toBe(active);
  });
});

describe('the switch is not an override — an unheld role is ignored', () => {
  it('refuses a role the user does not hold', async () => {
    requestRole('SUPER_ADMIN');

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx?.isSuperAdmin).toBe(false);

    const { active } = await resolveLmsRoles(SESSION_USER);
    expect(active).toBe('TEACHER');
  });

  it('refuses a single-role user any switch at all', async () => {
    h.userFindUnique.mockResolvedValue({ role: 'LEARNER', secondaryRole: null, isActive: true });
    requestRole('TENANT_ADMIN');

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('LEARNER');
    expect(ctx?.roles).toEqual(['LEARNER']);
  });

  it('ignores a garbage cookie value instead of failing the request', async () => {
    requestRole('not-a-role');
    expect((await getAuthContext())?.role).toBe('TEACHER');
  });

  it('self-heals a stale cookie once the second role is revoked', async () => {
    // `revokeSubAdmin` nulls secondaryRole; the browser still holds qs_role.
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', secondaryRole: null, isActive: true });
    requestRole('SUB_ADMIN');

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx?.roles).toEqual(['TEACHER']);
  });
});

describe('unswitched users are unaffected', () => {
  it('resolves the effective role when no cookie is present', async () => {
    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx?.roles).toEqual(['TEACHER', 'SUB_ADMIN']);
  });

  it('survives having no cookie jar at all (service / test call path)', async () => {
    h.cookieGet.mockImplementation(() => {
      throw new Error('called outside a request scope');
    });
    expect((await getAuthContext())?.role).toBe('TEACHER');
  });
});
