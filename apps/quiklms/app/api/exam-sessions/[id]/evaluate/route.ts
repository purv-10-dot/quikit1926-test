import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { evaluateSession } from '@/lib/services/exam-sessions-service';

const schema = z.object({ score: z.number(), teacherRemarks: z.string().optional() });

// PATCH /api/exam-sessions/:sessionId/evaluate — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const body = await parseBody(req, schema);
  const result = await evaluateSession(actor, actor.id, params!.id, body);
  return json({ success: true, data: result });
});
