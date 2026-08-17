import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, visibleOrgIds } from '@/lib/auth/context';
import { db } from '@/lib/db';

/**
 * GET /api/super-admin/stats — the console dashboard's tiles and "recent" lists.
 *
 * EVERY query here is org-scoped unless the caller is the platform OPERATOR.
 *
 * It used to run 14 unconditionally platform-wide queries behind nothing but
 * `requireRoles(actor, ['ADMIN'])`. That was correct while ADMIN meant
 * "the operator" and nothing else — but an org's founding admin now resolves to that
 * role (lib/auth/founding-admin.ts), so the check passed for them too and this
 * endpoint answered with every tenant, user, master course and progress row on the
 * platform. The reported symptom was a brand-new org whose dashboard already listed
 * a DIFFERENT org's tenant ("the office") under Recent Tenants.
 *
 * `orgScope` returns undefined for the operator — unscoped, byte-for-byte the old
 * behaviour — and the caller's orgId for everyone else. `LmsTenant.id === orgId`, so
 * the tenant filters are PK hits.
 *
 * QUERY BUDGET — why this reads as aggregates awaited one at a time.
 *
 * This used to be fifteen `count()` / `findMany()` calls in a single `Promise.all`.
 * On Vercel the Prisma pool is ONE connection (`connection_limit: 1`), so those
 * fifteen did not run concurrently — fourteen queued on the single connection while
 * the clock on `pool_timeout` (10s) ran, and the tail of the batch died with
 *
 *     P2024 — Timed out fetching a new connection from the connection pool
 *     (Current connection pool timeout: 10, connection limit: 1)
 *
 * which surfaced in the console as "Failed to load dashboard data". It was
 * intermittent, because whether the batch cleared 10s depended on what else shared
 * the instance — notably the RBAC seeding `GET /api/me` runs on a cold lambda, which
 * holds that one connection for several chunked `createMany`s.
 *
 * Two changes, both of which matter on a one-connection pool:
 *   1. The eleven per-status/per-type `count()` calls collapse into four `groupBy`
 *      aggregates — one round trip per model instead of three or four. Fifteen
 *      queries become seven.
 *   2. They are awaited SEQUENTIALLY. Queued time is what `pool_timeout` measures,
 *      so a query that waits behind six others can breach it however fast the
 *      database is; issuing them one at a time means each takes the free connection
 *      immediately and waits ~0. Against a healthy multi-connection pool this costs
 *      a few hundred ms of wall clock, which is the right trade for a tile grid.
 *
 * Raising `connection_limit` on the deployed `DATABASE_URL` is still the systemic
 * fix — every other fan-out route shares this ceiling. This route no longer depends
 * on it.
 */

/** Total across every bucket — replaces the standalone `count()` each pair used. */
function sumCounts(rows: readonly { _count: { _all: number } }[]): number {
  return rows.reduce((n, r) => n + r._count._all, 0);
}

/** One bucket's count, 0 when the group is absent (no rows in that state). */
function bucket<K extends string, T extends string>(
  rows: readonly ({ _count: { _all: number } } & Record<K, T>)[],
  key: K,
  value: T,
): number {
  return rows.find((r) => r[key] === value)?._count._all ?? 0;
}

export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);

  // The orgs this caller may see: their own plus every org they onboarded. NOT a single
  // `id === actor.orgId` — `onboardTenant` gives each new tenant its own org id, so that
  // filter reported 0 tenants to an admin who had just created several.
  const visible = await visibleOrgIds(actor);
  const tenantFilter = visible ? { id: { in: visible } } : {};
  /** LMS domain rows carry `orgId` directly. */
  const orgFilter = visible ? { orgId: { in: visible } } : {};
  /**
   * Master courses are the operator's SHARED catalogue and carry no orgId of their
   * own, so "scoped" means the ones distributed to a visible org
   * (`LmsMasterCourseSelectedTenant.orgId`) rather than the platform-wide count.
   */
  const masterFilter = visible ? { selectedTenants: { some: { orgId: { in: visible } } } } : {};

  // Tenant status lives on the platform `Org` now (see lib/tenant-status), not
  // on a column of this table, so the status counts are Org counts scoped to
  // the orgs that actually have a tenant row. `LmsTenant.id === Org.id`.
  const tenantIds = (
    await db.lmsTenant.findMany({ where: tenantFilter, select: { id: true } })
  ).map((t) => t.id);
  const scopedToTenants = { id: { in: tenantIds } };

  // Sequential on purpose — see the query-budget note above. Every read below is an
  // indexed aggregate, so the added latency is a few hundred ms at most.
  const tenantTypeGroups = await db.lmsTenant.groupBy({
    by: ['tenantType'],
    where: tenantFilter,
    _count: { _all: true },
  });
  const orgStatusGroups = await db.org.groupBy({
    by: ['status'],
    where: scopedToTenants,
    _count: { _all: true },
  });
  const recentTenants = await db.lmsTenant.findMany({
    where: tenantFilter,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, name: true, subdomain: true, tenantType: true, officialEmail: true, createdAt: true },
  });
  const roleGroups = await db.lmsUser.groupBy({
    by: ['role'],
    where: { ...orgFilter, role: { not: 'ADMIN' } },
    _count: { _all: true },
  });
  const recentUsers = await db.lmsUser.findMany({
    where: { ...orgFilter, role: { not: 'ADMIN' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
  });
  const courseStatusGroups = await db.lmsMasterCourse.groupBy({
    by: ['status'],
    where: masterFilter,
    _count: { _all: true },
  });
  const progressStatusGroups = await db.lmsProgress.groupBy({
    by: ['status'],
    where: orgFilter,
    _count: { _all: true },
  });

  const tenantTotal = sumCounts(tenantTypeGroups);
  const tenantCorporate = bucket(tenantTypeGroups, 'tenantType', 'corporate');
  const tenantSchool = bucket(tenantTypeGroups, 'tenantType', 'school');

  // `paused` stays "every status that is not active", exactly as the `{ not: 'active' }`
  // count it replaces — a third status must keep landing here rather than vanishing.
  const tenantActive = bucket(orgStatusGroups, 'status', 'active');
  const tenantPaused = sumCounts(orgStatusGroups) - tenantActive;

  // Same `where` as the groups, so the sum IS the count this used to ask for separately.
  const userTotal = sumCounts(roleGroups);

  const courseTotal = sumCounts(courseStatusGroups);
  const coursePublished = bucket(courseStatusGroups, 'status', 'Published');
  const courseDraft = bucket(courseStatusGroups, 'status', 'Draft');

  const progressTotal = sumCounts(progressStatusGroups);
  const progressCompleted = bucket(progressStatusGroups, 'status', 'Completed');
  const progressInProgress = bucket(progressStatusGroups, 'status', 'InProgress');

  const completionRate =
    progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;

  return json({
    success: true,
    data: {
      tenants: {
        total: tenantTotal,
        corporate: tenantCorporate,
        school: tenantSchool,
        active: tenantActive,
        // `Trial` is no longer a tenant state: a trial is expressed by
        // Subscription.status / OrgAppAccess.trialEndsAt, not by the org being
        // in a third state, and no tenant ever used the value. Reported as 0 so
        // the dashboard's response shape stays stable.
        trial: 0,
        paused: tenantPaused,
        recent: recentTenants,
      },
      users: {
        total: userTotal,
        byRole: Object.fromEntries(roleGroups.map((r) => [r.role, r._count._all])),
        recent: recentUsers,
      },
      masterCourses: { total: courseTotal, published: coursePublished, draft: courseDraft },
      progress: { total: progressTotal, completed: progressCompleted, inProgress: progressInProgress, rate: completionRate },
    },
  });
});
