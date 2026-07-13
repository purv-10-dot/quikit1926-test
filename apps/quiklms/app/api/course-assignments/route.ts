import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, tenantWhere } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

// GET /api/course-assignments — list this tenant's course assignments.
// Used by the tenant-admin Course Assignments page. SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN.
// No tenant-wide list helper exists in course-assignments-service, so we query
// directly here, scoped by tenantWhere(actor), and enrich with course titles +
// target (user/group) names so the page can render without extra round-trips.
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  // Non-super-admins must be scoped to a tenant.
  if (user.role !== 'SUPER_ADMIN' && !user.orgId) throw BadRequest('Tenant ID is required');

  const assignments = await prisma.courseAssignment.findMany({
    where: tenantWhere(user),
    orderBy: { assignedAt: 'desc' },
  });

  if (assignments.length === 0) return json({ success: true, data: [] });

  // Resolve course titles (MasterCourse first, then legacy Course).
  const courseIds = [...new Set(assignments.map((a) => a.courseId).filter(Boolean))];
  const [masterCourses, legacyCourses] = await Promise.all([
    prisma.masterCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
    prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
  ]);
  const courseTitle = new Map<string, string>();
  for (const c of legacyCourses) courseTitle.set(c.id, c.title);
  for (const c of masterCourses) courseTitle.set(c.id, c.title); // master wins

  // Resolve target names for USER and GROUP assignments.
  const userIds = [...new Set(assignments.filter((a) => a.targetType === 'USER').map((a) => a.targetId))];
  const groupIds = [...new Set(assignments.filter((a) => a.targetType === 'GROUP').map((a) => a.targetId))];
  const [users, groups] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    groupIds.length
      ? prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const targetName = new Map<string, string>();
  for (const u of users) targetName.set(u.id, `${u.firstName} ${u.lastName}`.trim());
  for (const g of groups) targetName.set(g.id, g.name);

  const data = assignments.map((a) => ({
    ...a,
    courseTitle: courseTitle.get(a.courseId),
    targetName: targetName.get(a.targetId),
  }));

  return json({ success: true, data });
});
