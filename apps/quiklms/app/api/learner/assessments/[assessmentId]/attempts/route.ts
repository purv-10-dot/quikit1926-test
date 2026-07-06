import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';

// GET /api/learner/assessments/:assessmentId/attempts
// DEFERRED: depends on the Assessments module (AssessmentsService.getQuizAttempts),
// not part of this porting batch. Legacy returns an empty array on missing
// context/error, so we preserve that resilient shape until assessments is ported.
export const GET = route(async (req) => {
  await requireAuth(req);
  return json({ success: true, data: [] });
});
