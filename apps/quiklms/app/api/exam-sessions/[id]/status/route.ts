import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getSessionStatus } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/:sessionId/status — LEARNER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const status = await getSessionStatus(actor, actor.id, params!.id);
  return json({ success: true, data: status });
});
