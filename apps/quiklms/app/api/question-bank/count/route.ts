import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { countQuestionsByFilters } from '@/lib/services/question-bank-service';

// GET /api/question-bank/count?subject=&difficulty=&tags= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const url = new URL(req.url);
  const tagsRaw = url.searchParams.get('tags');
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
  const data = await countQuestionsByFilters(actor.orgId, {
    subject: url.searchParams.get('subject') || undefined,
    difficulty: url.searchParams.get('difficulty') || undefined,
    tags,
  });
  return json({ success: true, data });
});
