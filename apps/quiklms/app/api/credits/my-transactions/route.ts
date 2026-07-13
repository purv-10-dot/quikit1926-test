import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTransactions } from '@/lib/services/credits-service';

// GET /api/credits/my-transactions — PARENT | LEARNER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'LEARNER']);
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '') || 1;
  const limit = parseInt(url.searchParams.get('limit') || '') || 20;
  const studentIdParam = url.searchParams.get('studentId') || undefined;
  const studentId = actor.role === 'PARENT' && studentIdParam ? studentIdParam : actor.id;
  return json(await getTransactions(actor.orgId!, studentId, page, limit));
});
