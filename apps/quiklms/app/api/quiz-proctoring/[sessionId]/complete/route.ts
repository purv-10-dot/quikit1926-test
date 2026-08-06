import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { completeSession } from '@/lib/services/quiz-proctoring-service';

// POST /api/quiz-proctoring/:sessionId/complete — LEARNER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const session = await completeSession(actor, actor.id, params!.sessionId);
  return json({ success: true, data: session });
});
