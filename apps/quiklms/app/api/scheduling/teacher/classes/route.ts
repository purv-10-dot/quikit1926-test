import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { getTeacherClasses, getAllTenantClasses } from '@/lib/services/scheduling-service';

// GET /api/scheduling/teacher/classes — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') || undefined;
  const endDate = url.searchParams.get('endDate') || undefined;
  const teacherIdParam = url.searchParams.get('teacherId') || undefined;

  const isAdmin = userHasRole(actor, 'TENANT_ADMIN') || userHasRole(actor, 'SUB_ADMIN');
  if (isAdmin && !teacherIdParam) {
    return json(await getAllTenantClasses(actor.orgId!, startDate, endDate));
  }
  const teacherId = isAdmin && teacherIdParam ? teacherIdParam : actor.id;
  return json(await getTeacherClasses(actor.orgId!, teacherId, startDate, endDate));
});
