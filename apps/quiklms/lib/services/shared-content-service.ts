/**
 * Shared content service — ported from SharedContentService (Prisma).
 * pushToAllTenants: a master Course is shared with every Active tenant by
 * creating a tenant-scoped copy Course (reference, no file duplication — the
 * legacy code references the same modules; here we copy the master Course's
 * Module rows by re-pointing, see note) plus a SharedContent link row.
 *
 * NOTE: the legacy code set tenantCourse.modules = masterCourse.modules (shared
 * ObjectId refs). In the relational model Module.courseId is a hard FK, so we
 * clone the master course's modules+lessons into the tenant copy.
 */
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

export async function pushToAllTenants(
  masterCourseId: string,
): Promise<{ success: boolean; sharedCount: number; tenantIds: string[] }> {
  const masterCourse = await prisma.lmsCourse.findUnique({
    where: { id: masterCourseId },
    include: { modules: { include: { lessons: true } } },
  });
  if (!masterCourse) throw NotFound('Master course not found');
  if (!masterCourse.isMaster) throw BadRequest('Course is not marked as master course');

  const activeTenants = await prisma.lmsTenant.findMany({ where: { status: 'Active' } });

  const sharedTenantIds: string[] = [];
  let sharedCount = 0;

  for (const tenant of activeTenants) {
    try {
      const existing = await prisma.lmsSharedContent.findUnique({
        where: { masterCourseId_orgId: { masterCourseId, orgId: tenant.id } },
      });

      if (existing) {
        await prisma.lmsSharedContent.update({ where: { id: existing.id }, data: { isActive: true } });
        sharedTenantIds.push(tenant.id);
        sharedCount++;
        continue;
      }

      // Create the tenant's copy of the course + clone modules/lessons.
      const tenantCourse = await prisma.lmsCourse.create({
        data: {
          title: masterCourse.title,
          description: masterCourse.description,
          orgId: tenant.id,
          authorId: masterCourse.authorId,
          status: 'Published',
          isMaster: false,
          thumbnailUrl: masterCourse.thumbnailUrl,
          modules: {
            create: masterCourse.modules.map((m) => ({
              orgId: tenant.id,
              title: m.title,
              description: m.description,
              orderIndex: m.orderIndex,
              assessmentId: m.assessmentId,
              lessons: {
                create: m.lessons.map((l) => ({
                  title: l.title,
                  type: l.type,
                  contentUrl: l.contentUrl,
                  orderIndex: l.orderIndex,
                  isMaster: l.isMaster,
                  description: l.description,
                  duration: l.duration,
                  fileSize: l.fileSize,
                  captions: l.captions ?? undefined,
                  quiz: l.quiz ?? undefined,
                })),
              },
            })),
          },
        },
      });

      await prisma.lmsSharedContent.create({
        data: {
          masterCourseId,
          orgId: tenant.id,
          tenantCourseId: tenantCourse.id,
          isActive: true,
        },
      });
      sharedTenantIds.push(tenant.id);
      sharedCount++;
    } catch {
      // Log error but continue with other tenants (parity with legacy).
    }
  }

  return { success: true, sharedCount, tenantIds: sharedTenantIds };
}

export async function getSharedContentForTenant(orgId: string) {
  const shared = await prisma.lmsSharedContent.findMany({
    where: { orgId, isActive: true },
  });

  // Legacy populated masterCourseId + tenantCourseId. Those are scalar refs here
  // (no Prisma relation), so resolve them manually to preserve the response shape.
  const masterIds = shared.map((s) => s.masterCourseId);
  const tenantCourseIds = shared.map((s) => s.tenantCourseId);
  const [masters, tenantCourses] = await Promise.all([
    prisma.lmsCourse.findMany({ where: { id: { in: masterIds } } }),
    prisma.lmsCourse.findMany({ where: { id: { in: tenantCourseIds } } }),
  ]);
  const masterMap = new Map(masters.map((c) => [c.id, c]));
  const tcMap = new Map(tenantCourses.map((c) => [c.id, c]));

  return shared.map((s) => ({
    ...s,
    masterCourseId: masterMap.get(s.masterCourseId) ?? s.masterCourseId,
    tenantCourseId: tcMap.get(s.tenantCourseId) ?? s.tenantCourseId,
  }));
}
