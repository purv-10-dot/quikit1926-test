import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { bulkCreateQuestions } from '@/lib/services/question-bank-service';

const schema = z.object({ questions: z.array(z.record(z.string(), z.any())).default([]) });

// POST /api/question-bank/bulk — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const body = await parseBody(req, schema);
  const result = await bulkCreateQuestions(actor.tenantId, actor.id, body.questions as Record<string, unknown>[]);
  return json({ success: true, data: result, count: result.length });
});
