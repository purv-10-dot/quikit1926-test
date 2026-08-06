import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { startSession } from '@/lib/services/exam-sessions-service';

// POST /api/exam-sessions/:examId/start — LEARNER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const session = await startSession(actor, actor.id, params!.id);
  return json({ success: true, data: session });
});
