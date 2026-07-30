import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getMySession } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/exam/:examId/my-session — LEARNER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const session = await getMySession(actor, actor.id, params!.examId);
  return json({ success: true, data: session });
});
