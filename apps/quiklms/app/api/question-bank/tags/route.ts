import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getQuestionTags } from '@/lib/services/question-bank-service';

// GET /api/question-bank/tags — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await getQuestionTags(actor.tenantId);
  return json({ success: true, data });
});
