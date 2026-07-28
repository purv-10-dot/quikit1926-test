import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { submitSession } from '@/lib/services/exam-sessions-service';

// POST /api/exam-sessions/:sessionId/submit — LEARNER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const result = await submitSession(actor, actor.id, params!.id);
  return json({ success: true, data: result });
});
