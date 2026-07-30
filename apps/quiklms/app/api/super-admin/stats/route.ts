import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, visibleOrgIds } from '@/lib/auth/context';
import { db } from '@/lib/db';

/**
 * GET /api/super-admin/stats — the console dashboard's tiles and "recent" lists.
 *
 * EVERY query here is org-scoped unless the caller is the platform OPERATOR.
 *
 * It used to run 14 unconditionally platform-wide queries behind nothing but
 * `requireRoles(actor, ['SUPER_ADMIN'])`. That was correct while SUPER_ADMIN meant
 * "the operator" and nothing else — but an org's founding admin now resolves to that
 * role (lib/auth/founding-admin.ts), so the check passed for them too and this
 * endpoint answered with every tenant, user, master course and progress row on the
 * platform. The reported symptom was a brand-new org whose dashboard already listed
 * a DIFFERENT org's tenant ("the office") under Recent Tenants.
 *
 * `orgScope` returns undefined for the operator — unscoped, byte-for-byte the old
 * behaviour — and the caller's orgId for everyone else. `LmsTenant.id === orgId`, so
 * the tenant filters are PK hits.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);

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

  const [
    tenantTotal, tenantCorporate, tenantSchool,
    tenantActive, tenantPaused,
    recentTenants,
    userTotal, roleGroups, recentUsers,
    courseTotal, coursePublished, courseDraft,
    progressTotal, progressCompleted, progressInProgress,
  ] = await Promise.all([
    db.lmsTenant.count({ where: tenantFilter }),
    db.lmsTenant.count({ where: { ...tenantFilter, tenantType: 'corporate' } }),
    db.lmsTenant.count({ where: { ...tenantFilter, tenantType: 'school' } }),
    db.org.count({ where: { ...scopedToTenants, status: 'active' } }),
    db.org.count({ where: { ...scopedToTenants, status: { not: 'active' } } }),
    db.lmsTenant.findMany({
      where: tenantFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, subdomain: true, tenantType: true, officialEmail: true, createdAt: true },
    }),
    db.lmsUser.count({ where: { ...orgFilter, role: { not: 'SUPER_ADMIN' } } }),
    db.lmsUser.groupBy({
      by: ['role'],
      where: { ...orgFilter, role: { not: 'SUPER_ADMIN' } },
      _count: { _all: true },
    }),
    db.lmsUser.findMany({
      where: { ...orgFilter, role: { not: 'SUPER_ADMIN' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
    }),
    db.lmsMasterCourse.count({ where: masterFilter }),
    db.lmsMasterCourse.count({ where: { ...masterFilter, status: 'Published' } }),
    db.lmsMasterCourse.count({ where: { ...masterFilter, status: 'Draft' } }),
    db.lmsProgress.count({ where: orgFilter }),
    db.lmsProgress.count({ where: { ...orgFilter, status: 'Completed' } }),
    db.lmsProgress.count({ where: { ...orgFilter, status: 'InProgress' } }),
  ]);

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
