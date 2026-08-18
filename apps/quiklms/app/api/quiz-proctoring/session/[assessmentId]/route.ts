import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, requireQuizProctoring } from '@/lib/auth/context';
import { getSessionForLearner } from '@/lib/services/quiz-proctoring-service';

// GET /api/quiz-proctoring/session/:assessmentId — LEARNER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);

  await requireQuizProctoring(actor);
  const session = await getSessionForLearner(actor, actor.id, params!.assessmentId);
  return json({ success: true, data: session });
});
