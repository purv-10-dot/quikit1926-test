import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { saveAnswers } from '@/lib/services/exam-sessions-service';

const schema = z.object({ answers: z.record(z.string(), z.any()) });

// PATCH /api/exam-sessions/:sessionId/save — LEARNER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const { answers } = await parseBody(req, schema);
  const result = await saveAnswers(actor, actor.id, params!.id, answers);
  return json({ success: true, data: result });
});
