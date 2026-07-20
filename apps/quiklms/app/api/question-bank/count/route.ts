import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { countQuestionsByFilters } from '@/lib/services/question-bank-service';

// GET /api/question-bank/count?subject=&difficulty=&tags= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const url = new URL(req.url);
  // `getAll`, not `get`: Express parsed a repeated `?tags=a&tags=b` into an
  // array, while `searchParams.get()` returns only the FIRST value — so the
  // repeated form silently filtered on one tag and under-filtered the results
  // (and /count). Both forms are supported: repeated params and `?tags=a,b`.
  const tagsRaw = url.searchParams.getAll('tags');
  const tags = tagsRaw.length
    ? tagsRaw.flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean)
    : undefined;
  const data = await countQuestionsByFilters(actor.orgId, {
    subject: url.searchParams.get('subject') || undefined,
    difficulty: url.searchParams.get('difficulty') || undefined,
    tags,
  });
  return json({ success: true, data });
});
