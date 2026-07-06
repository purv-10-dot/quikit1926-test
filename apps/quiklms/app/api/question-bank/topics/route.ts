import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getQuestionTopics } from '@/lib/services/question-bank-service';

// GET /api/question-bank/topics?subject= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const subject = new URL(req.url).searchParams.get('subject') || undefined;
  const data = await getQuestionTopics(actor.tenantId, subject);
  return json({ success: true, data });
});
