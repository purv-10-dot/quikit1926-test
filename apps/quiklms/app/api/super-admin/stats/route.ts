import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { db } from '@/lib/db';

export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);

  // Tenant status lives on the platform `Org` now (see lib/tenant-status), not
  // on a column of this table, so the status counts are Org counts scoped to
  // the orgs that actually have a tenant row. `LmsTenant.id === Org.id`.
  const tenantIds = (await db.lmsTenant.findMany({ select: { id: true } })).map((t) => t.id);
  const scopedToTenants = { id: { in: tenantIds } };

  const [
    tenantTotal, tenantCorporate, tenantSchool,
    tenantActive, tenantPaused,
    recentTenants,
    userTotal, roleGroups, recentUsers,
    courseTotal, coursePublished, courseDraft,
    progressTotal, progressCompleted, progressInProgress,
  ] = await Promise.all([
    db.lmsTenant.count(),
    db.lmsTenant.count({ where: { tenantType: 'corporate' } }),
    db.lmsTenant.count({ where: { tenantType: 'school' } }),
    db.org.count({ where: { ...scopedToTenants, status: 'active' } }),
    db.org.count({ where: { ...scopedToTenants, status: { not: 'active' } } }),
    db.lmsTenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, subdomain: true, tenantType: true, officialEmail: true, createdAt: true },
    }),
    db.lmsUser.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    db.lmsUser.groupBy({
      by: ['role'],
      where: { role: { not: 'SUPER_ADMIN' } },
      _count: { _all: true },
    }),
    db.lmsUser.findMany({
      where: { role: { not: 'SUPER_ADMIN' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
    }),
    db.lmsMasterCourse.count(),
    db.lmsMasterCourse.count({ where: { status: 'Published' } }),
    db.lmsMasterCourse.count({ where: { status: 'Draft' } }),
    db.lmsProgress.count(),
    db.lmsProgress.count({ where: { status: 'Completed' } }),
    db.lmsProgress.count({ where: { status: 'InProgress' } }),
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
