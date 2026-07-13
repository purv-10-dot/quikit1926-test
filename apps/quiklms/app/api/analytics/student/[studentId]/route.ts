import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentProgress } from '@/lib/services/analytics-service';

// GET /api/analytics/student/:studentId — TENANT_ADMIN | SUB_ADMIN | TEACHER | PARENT
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER', 'PARENT']);
  return json(await getStudentProgress(actor.orgId ?? '', params!.studentId));
});
