/**
 * A new org's dashboard must not list another org's tenant.
 *
 * THE BUG. `GET /api/super-admin/stats` powers the console dashboard's tiles and its
 * "Recent Tenants" / "Recent Users" lists. It was gated on nothing but
 * `requireRoles(actor, ['SUPER_ADMIN'])` and then ran 14 unconditionally
 * platform-wide queries — `db.lmsTenant.findMany()`, `db.lmsUser.count()`,
 * `db.lmsProgress.count()` and so on, with no org filter anywhere.
 *
 * That was sound while SUPER_ADMIN meant "the platform operator" and nothing else.
 * Once an org's FOUNDING admin resolved to that role (lib/auth/founding-admin.ts),
 * the role check passed for them too: a brand-new org's admin opened /dashboard and
 * saw a DIFFERENT org's tenant ("the office") already sitting in the list.
 *
 * The fix scopes every query on `orgScope(actor)`, which is keyed on the platform
 * `isSuperAdmin` claim rather than the role.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  tenantFindMany: vi.fn(),
  tenantCount: vi.fn(),
  orgCount: vi.fn(),
  orgFindMany: vi.fn(),
  userCount: vi.fn(),
  userGroupBy: vi.fn(),
  userFindMany: vi.fn(),
  masterCount: vi.fn(),
  progressCount: vi.fn(),
}));

// Sever the PrismaClient-at-module-load chain that `lib/auth/context` drags in via
// the central entitlement gate (no DATABASE_URL in the test env). Same shape as
// __tests__/unit/auth-context-tenant.test.ts.
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth/central-access', () => ({
  hasCentralAppAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/auth/context', async (importOriginal) => {
  // `orgScope` is the thing under test — keep the REAL implementation and stub only
  // the session lookup, so a change to the scoping rule cannot be mocked away.
  const actual = await importOriginal<typeof import('@/lib/auth/context')>();
  return { ...actual, requireAuth: h.requireAuth };
});
vi.mock('@/lib/db', () => ({
  db: {
    lmsTenant: { findMany: h.tenantFindMany, count: h.tenantCount },
    // `visibleOrgIds` reads Org.createdBy to find the orgs this admin onboarded.
    org: { count: h.orgCount, findMany: h.orgFindMany },
    lmsUser: { count: h.userCount, groupBy: h.userGroupBy, findMany: h.userFindMany },
    lmsMasterCourse: { count: h.masterCount },
    lmsProgress: { count: h.progressCount },
  },
}));

import { GET } from '@/app/api/super-admin/stats/route';

const OWN = 'org-mine';
/** A tenant this admin ONBOARDED — a different org, still theirs to see. */
const CLIENT = 'org-my-client';
const OTHER = 'org-the-office';

function actor(over: Record<string, unknown> = {}) {
  return {
    id: 'founder',
    email: 'founder@new.test',
    role: 'SUPER_ADMIN' as const,
    secondaryRole: null,
    roles: ['SUPER_ADMIN' as const],
    orgId: OWN,
    tenantType: 'corporate' as const,
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    isSuperAdmin: false, // founding admin, NOT the platform operator
    ...over,
  };
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  // This admin onboarded one org; it must be inside their scope alongside their own.
  h.orgFindMany.mockResolvedValue([{ id: CLIENT }]);
  h.tenantFindMany.mockResolvedValue([]);
  h.tenantCount.mockResolvedValue(0);
  h.orgCount.mockResolvedValue(0);
  h.userCount.mockResolvedValue(0);
  h.userGroupBy.mockResolvedValue([]);
  h.userFindMany.mockResolvedValue([]);
  h.masterCount.mockResolvedValue(0);
  h.progressCount.mockResolvedValue(0);
});

const call = () => GET(new Request('http://localhost/api/super-admin/stats') as never, {} as never);

describe('a founding admin sees their own org and the ones they onboarded', () => {
  it('filters every tenant query to their visible org set', async () => {
    h.requireAuth.mockResolvedValue(actor());
    await call();

    // Recent Tenants — the list that showed "the office".
    for (const [args] of [...h.tenantFindMany.mock.calls, ...h.tenantCount.mock.calls]) {
      expect(args.where).toEqual(expect.objectContaining({ id: { in: [OWN, CLIENT] } }));
    }
    expect(h.tenantFindMany).toHaveBeenCalled();
  });

  /**
   * REGRESSION: "I created a corporate tenant and the Tenants tab is empty."
   *
   * The first cut of this scoping filtered on `id === actor.orgId`, which is only the
   * admin's OWN org. `onboardTenant` gives every tenant it creates a brand-new org id,
   * so each one was filtered straight out and the console reported zero tenants to the
   * admin who had just onboarded them. The link back is `Org.createdBy`.
   */
  it('INCLUDES a tenant the admin onboarded, not just their own org', async () => {
    h.requireAuth.mockResolvedValue(actor());
    await call();

    const [[args]] = h.tenantFindMany.mock.calls;
    expect(args.where.id.in).toContain(CLIENT);
    expect(args.where.id.in).toContain(OWN);
  });

  it('resolves the onboarded set from Org.createdBy', async () => {
    h.requireAuth.mockResolvedValue(actor());
    await call();

    expect(h.orgFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: 'founder' } }),
    );
  });

  it('filters user, progress and master-course queries to that set', async () => {
    h.requireAuth.mockResolvedValue(actor());
    await call();

    for (const [args] of [...h.userCount.mock.calls, ...h.userFindMany.mock.calls, ...h.userGroupBy.mock.calls]) {
      expect(args.where).toEqual(expect.objectContaining({ orgId: { in: [OWN, CLIENT] } }));
    }
    for (const [args] of h.progressCount.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ orgId: { in: [OWN, CLIENT] } }));
    }
    // Master courses have no orgId of their own — scoped via distribution instead.
    for (const [args] of h.masterCount.mock.calls) {
      expect(args.where.selectedTenants).toEqual({ some: { orgId: { in: [OWN, CLIENT] } } });
    }
  });

  it('never emits a query that could match another org', async () => {
    h.requireAuth.mockResolvedValue(actor());
    await call();

    const everyWhere = [
      ...h.tenantFindMany.mock.calls, ...h.tenantCount.mock.calls,
      ...h.userCount.mock.calls, ...h.userFindMany.mock.calls, ...h.userGroupBy.mock.calls,
      ...h.masterCount.mock.calls, ...h.progressCount.mock.calls,
    ].map(([a]) => JSON.stringify(a.where));

    expect(everyWhere.length).toBeGreaterThan(0);
    for (const w of everyWhere) {
      expect(w).not.toContain(OTHER);
      // An empty/absent filter is what leaked in the first place.
      expect(w === '{}' || w === undefined).toBe(false);
    }
  });
});

describe('the platform operator still sees everything', () => {
  it('emits unscoped queries when isSuperAdmin is true', async () => {
    h.requireAuth.mockResolvedValue(actor({ isSuperAdmin: true }));
    await call();

    // Byte-for-byte the old behaviour for the real operator.
    expect(h.tenantFindMany.mock.calls.some(([a]) => JSON.stringify(a.where) === '{}')).toBe(true);
    expect(h.progressCount.mock.calls.some(([a]) => JSON.stringify(a.where) === '{}')).toBe(true);
  });
});
