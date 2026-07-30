import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { startSession } from '@/lib/services/quiz-proctoring-service';

const schema = z.object({
  assessmentId: z.string(),
  courseId: z.string(),
  timeLimitMinutes: z.number().optional(),
});

// POST /api/quiz-proctoring/start — LEARNER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const body = await parseBody(req, schema);
  const session = await startSession(actor, actor.id, body.assessmentId, body.courseId, body.timeLimitMinutes);
  return json({ success: true, data: session });
});
