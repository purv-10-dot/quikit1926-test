import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getQuestionSubjects } from '@/lib/services/question-bank-service';

// GET /api/question-bank/subjects — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const data = await getQuestionSubjects(actor.orgId);
  return json({ success: true, data });
});
