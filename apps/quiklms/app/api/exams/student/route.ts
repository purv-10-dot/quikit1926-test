import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentExams } from '@/lib/services/exams-service';

// GET /api/exams/student — LEARNER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const tenantId = (actor.tenantId || '').toString();
  if (!tenantId) return json({ success: true, data: [] });
  const exams = await getStudentExams(actor, actor.id);
  return json({ success: true, data: exams });
});
