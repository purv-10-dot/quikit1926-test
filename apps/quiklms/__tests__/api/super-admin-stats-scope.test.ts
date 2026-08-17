/**
 * A new org's dashboard must not list another org's tenant.
 *
 * THE BUG. `GET /api/super-admin/stats` powers the console dashboard's tiles and its
 * "Recent Tenants" / "Recent Users" lists. It was gated on nothing but
 * `requireRoles(actor, ['ADMIN'])` and then ran 14 unconditionally
 * platform-wide queries — `db.lmsTenant.findMany()`, `db.lmsUser.count()`,
 * `db.lmsProgress.count()` and so on, with no org filter anywhere.
 *
 * That was sound while ADMIN meant "the platform operator" and nothing else.
 * Once an org's FOUNDING admin resolved to that role (lib/auth/founding-admin.ts),
 * the role check passed for them too: a brand-new org's admin opened /dashboard and
 * saw a DIFFERENT org's tenant ("the office") already sitting in the list.
 *
 * The fix scopes every query on `orgScope(actor)`, which is keyed on the platform
 * `isSuperAdmin` claim rather than the role.
 *
 * The second describe block covers the connection-pool regression — see its doc.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  tenantFindMany: vi.fn(),
  tenantGroupBy: vi.fn(),
  orgGroupBy: vi.fn(),
  orgFindMany: vi.fn(),
  userGroupBy: vi.fn(),
  userFindMany: vi.fn(),
  masterGroupBy: vi.fn(),
  progressGroupBy: vi.fn(),
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
    lmsTenant: { findMany: h.tenantFindMany, groupBy: h.tenantGroupBy },
    // `visibleOrgIds` reads Org.createdBy to find the orgs this admin onboarded.
    org: { groupBy: h.orgGroupBy, findMany: h.orgFindMany },
    lmsUser: { groupBy: h.userGroupBy, findMany: h.userFindMany },
    lmsMasterCourse: { groupBy: h.masterGroupBy },
    lmsProgress: { groupBy: h.progressGroupBy },
  },
}));

import { GET } from '@/app/api/super-admin/stats/route';

const OWN = 'org-mine';
/** A tenant this admin ONBOARDED — a different org, still theirs to see. */
const CLIENT = 'org-my-client';
const OTHER = 'org-the-office';

/** Every mocked Prisma call, so a test can reason about the whole query budget. */
const DB_CALLS = [
  'tenantFindMany', 'tenantGroupBy', 'orgGroupBy', 'orgFindMany',
  'userGroupBy', 'userFindMany', 'masterGroupBy', 'progressGroupBy',
] as const;

function actor(over: Record<string, unknown> = {}) {
  return {
    id: 'founder',
    email: 'founder@new.test',
    role: 'ADMIN' as const,
    orgId: OWN,
    tenantType: 'corporate' as const,
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    isSuperAdmin: false, // founding admin, NOT the platform operator
    ...over,
  };
}

/** Peak number of queries the route had open at once, and the total it issued. */
let inFlight = 0;
let peakInFlight = 0;
let totalCalls = 0;

/**
 * A mocked query that actually takes time. The `setTimeout(0)` matters: a
 * `Promise.all` fan-out enters every mock before any of them resolves, so the peak
 * counter reads N; awaiting them one at a time keeps it at 1. Without a real
 * suspension point both shapes would look identical.
 */
function tracked(result: unknown) {
  return async () => {
    inFlight += 1;
    totalCalls += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 0));
    inFlight -= 1;
    return result;
  };
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  inFlight = 0;
  peakInFlight = 0;
  totalCalls = 0;
  // This admin onboarded one org; it must be inside their scope alongside their own.
  h.orgFindMany.mockImplementation(tracked([{ id: CLIENT }]));
  h.tenantFindMany.mockImplementation(tracked([]));
  h.tenantGroupBy.mockImplementation(tracked([]));
  h.orgGroupBy.mockImplementation(tracked([]));
  h.userGroupBy.mockImplementation(tracked([]));
  h.userFindMany.mockImplementation(tracked([]));
  h.masterGroupBy.mockImplementation(tracked([]));
  h.progressGroupBy.mockImplementation(tracked([]));
  h.requireAuth.mockResolvedValue(actor());
});

const call = () => GET(new Request('http://localhost/api/super-admin/stats') as never, {} as never);

describe('a founding admin sees their own org and the ones they onboarded', () => {
  it('filters every tenant query to their visible org set', async () => {
    await call();

    // Recent Tenants — the list that showed "the office".
    for (const [args] of [...h.tenantFindMany.mock.calls, ...h.tenantGroupBy.mock.calls]) {
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
    await call();

    const [[args]] = h.tenantFindMany.mock.calls;
    expect(args.where.id.in).toContain(CLIENT);
    expect(args.where.id.in).toContain(OWN);
  });

  it('resolves the onboarded set from Org.createdBy', async () => {
    await call();

    expect(h.orgFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: 'founder' } }),
    );
  });

  it('filters user, progress and master-course queries to that set', async () => {
    await call();

    for (const [args] of [...h.userFindMany.mock.calls, ...h.userGroupBy.mock.calls]) {
      expect(args.where).toEqual(expect.objectContaining({ orgId: { in: [OWN, CLIENT] } }));
    }
    for (const [args] of h.progressGroupBy.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ orgId: { in: [OWN, CLIENT] } }));
    }
    // Master courses have no orgId of their own — scoped via distribution instead.
    for (const [args] of h.masterGroupBy.mock.calls) {
      expect(args.where.selectedTenants).toEqual({ some: { orgId: { in: [OWN, CLIENT] } } });
    }
  });

  it('never emits a query that could match another org', async () => {
    await call();

    const everyWhere = [
      ...h.tenantFindMany.mock.calls, ...h.tenantGroupBy.mock.calls,
      ...h.userFindMany.mock.calls, ...h.userGroupBy.mock.calls,
      ...h.masterGroupBy.mock.calls, ...h.progressGroupBy.mock.calls,
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
    expect(h.progressGroupBy.mock.calls.some(([a]) => JSON.stringify(a.where) === '{}')).toBe(true);
  });
});

/**
 * REGRESSION — "Failed to load dashboard data" on Vercel.
 *
 * This route fanned fifteen queries out through one `Promise.all`. The deployed
 * Prisma pool holds ONE connection (`connection_limit: 1`), so fourteen of them sat
 * queued while `pool_timeout` (10s) ran down, and the tail of the batch died with
 *
 *     P2024 — Timed out fetching a new connection from the connection pool
 *
 * observed in production against `prisma.org.count()`, `prisma.lmsTenant.findMany()`,
 * `prisma.lmsUser.count()` and `prisma.lmsProgress.count()` on the same request.
 * The console rendered its error card. It was intermittent — the batch only breached
 * 10s when something else on the instance (the RBAC seeding `GET /api/me` runs on a
 * cold lambda) was holding the connection.
 *
 * Both properties below are the fix, and both must hold on a one-connection pool:
 * few queries, and never more than one in flight.
 */
describe('survives a one-connection Prisma pool', () => {
  it('never holds more than one query open at a time', async () => {
    await call();

    expect(peakInFlight).toBe(1);
  });

  it('issues far fewer queries than the fifteen-way fan-out it replaced', async () => {
    await call();

    // 9 today: visibleOrgIds + tenant ids + 4 groupBys + 2 recent lists + org status.
    expect(totalCalls).toBeLessThanOrEqual(10);
    expect(totalCalls).toBeGreaterThan(0);
  });

  it('asks each model for its buckets once instead of once per status', async () => {
    await call();

    // The per-status `count()` calls are gone — one aggregate per model now.
    for (const name of ['tenantGroupBy', 'orgGroupBy', 'masterGroupBy', 'progressGroupBy'] as const) {
      expect(h[name]).toHaveBeenCalledTimes(1);
    }
  });

  it('exposes no count() call the mocked client would have to provide', async () => {
    // `db` is mocked with groupBy/findMany only. A reintroduced `count()` would throw
    // here rather than silently re-adding a round trip.
    await expect(call()).resolves.toBeDefined();
    expect(DB_CALLS.length).toBe(8);
  });
});

/**
 * The tiles are derived from aggregates now, so the arithmetic that used to be a
 * dedicated `count()` has to be right.
 */
describe('derives the tile numbers from the grouped counts', () => {
  it('sums buckets for totals and reads named buckets for the splits', async () => {
    h.tenantGroupBy.mockImplementation(tracked([
      { tenantType: 'corporate', _count: { _all: 3 } },
      { tenantType: 'school', _count: { _all: 2 } },
    ]));
    // `paused` is every status that is NOT active — a third state must land there.
    h.orgGroupBy.mockImplementation(tracked([
      { status: 'active', _count: { _all: 4 } },
      { status: 'paused', _count: { _all: 1 } },
      { status: 'suspended', _count: { _all: 2 } },
    ]));
    h.userGroupBy.mockImplementation(tracked([
      { role: 'LEARNER', _count: { _all: 7 } },
      { role: 'TEACHER', _count: { _all: 3 } },
    ]));
    h.masterGroupBy.mockImplementation(tracked([
      { status: 'Published', _count: { _all: 5 } },
      { status: 'Draft', _count: { _all: 4 } },
    ]));
    h.progressGroupBy.mockImplementation(tracked([
      { status: 'Completed', _count: { _all: 3 } },
      { status: 'InProgress', _count: { _all: 1 } },
      { status: 'NotStarted', _count: { _all: 6 } },
    ]));

    const res = await call();
    const { data } = await res.json();

    expect(data.tenants).toEqual(expect.objectContaining({
      total: 5, corporate: 3, school: 2, active: 4, paused: 3, trial: 0,
    }));
    expect(data.users).toEqual(expect.objectContaining({
      total: 10, byRole: { LEARNER: 7, TEACHER: 3 },
    }));
    expect(data.masterCourses).toEqual({ total: 9, published: 5, draft: 4 });
    expect(data.progress).toEqual({ total: 10, completed: 3, inProgress: 1, rate: 30 });
  });

  it('reports zeroes rather than NaN when the org has no rows at all', async () => {
    const res = await call();
    const { data } = await res.json();

    expect(data.tenants.total).toBe(0);
    expect(data.users.total).toBe(0);
    expect(data.progress).toEqual({ total: 0, completed: 0, inProgress: 0, rate: 0 });
  });
});
