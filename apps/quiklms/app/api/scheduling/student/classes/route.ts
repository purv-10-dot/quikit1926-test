import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { getStudentClasses } from '@/lib/services/scheduling-service';

// GET /api/scheduling/student/classes — LEARNER | PARENT | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER', 'PARENT', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') || undefined;
  const endDate = url.searchParams.get('endDate') || undefined;
  const studentIdParam = url.searchParams.get('studentId') || undefined;

  const isParentOrAdmin =
    actor.role === 'PARENT' || userHasRole(actor, 'TENANT_ADMIN') || userHasRole(actor, 'SUB_ADMIN');
  const studentId = isParentOrAdmin && studentIdParam ? studentIdParam : actor.id;
  return json(await getStudentClasses(actor.tenantId!, studentId, startDate, endDate));
});
