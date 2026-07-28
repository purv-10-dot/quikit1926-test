import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getExamAnalytics } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/exam/:examId/analytics — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const analytics = await getExamAnalytics(actor, params!.examId);
  return json({ success: true, data: analytics });
});
