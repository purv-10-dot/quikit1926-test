import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getResult } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/:sessionId/result — LEARNER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const result = await getResult(actor, actor.id, params!.id);
  return json({ success: true, data: result });
});
