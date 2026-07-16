import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);

  const [
    tenantTotal, tenantCorporate, tenantSchool,
    tenantActive, tenantTrial, tenantPaused,
    recentTenants,
    userTotal, roleGroups, recentUsers,
    courseTotal, coursePublished, courseDraft,
    progressTotal, progressCompleted, progressInProgress,
  ] = await Promise.all([
    prisma.lmsTenant.count(),
    prisma.lmsTenant.count({ where: { tenantType: 'corporate' } }),
    prisma.lmsTenant.count({ where: { tenantType: 'school' } }),
    prisma.lmsTenant.count({ where: { status: 'Active' } }),
    prisma.lmsTenant.count({ where: { status: 'Trial' } }),
    prisma.lmsTenant.count({ where: { status: 'Paused' } }),
    prisma.lmsTenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, subdomain: true, tenantType: true, status: true, officialEmail: true, createdAt: true },
    }),
    prisma.lmsUser.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    prisma.lmsUser.groupBy({
      by: ['role'],
      where: { role: { not: 'SUPER_ADMIN' } },
      _count: { _all: true },
    }),
    prisma.lmsUser.findMany({
      where: { role: { not: 'SUPER_ADMIN' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
    }),
    prisma.lmsMasterCourse.count(),
    prisma.lmsMasterCourse.count({ where: { status: 'Published' } }),
    prisma.lmsMasterCourse.count({ where: { status: 'Draft' } }),
    prisma.lmsProgress.count(),
    prisma.lmsProgress.count({ where: { status: 'Completed' } }),
    prisma.lmsProgress.count({ where: { status: 'InProgress' } }),
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
        trial: tenantTrial,
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
