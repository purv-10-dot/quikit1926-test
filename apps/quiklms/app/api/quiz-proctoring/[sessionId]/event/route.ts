import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { logEvent } from '@/lib/services/quiz-proctoring-service';

const schema = z.object({ eventType: z.string(), metadata: z.any().optional() });

// POST /api/quiz-proctoring/:sessionId/event — LEARNER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const body = await parseBody(req, schema);
  const result = await logEvent(actor, actor.id, params!.sessionId, body.eventType, body.metadata);
  return json({ success: true, data: result });
});
