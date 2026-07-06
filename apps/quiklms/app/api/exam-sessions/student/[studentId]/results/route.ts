import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentResults } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/student/:studentId/results — PARENT | TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const results = await getStudentResults(actor, params!.studentId);
  return json({ success: true, data: results });
});
