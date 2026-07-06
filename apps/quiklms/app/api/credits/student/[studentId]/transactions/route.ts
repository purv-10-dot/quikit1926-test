import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTransactions } from '@/lib/services/credits-service';

// GET /api/credits/student/:studentId/transactions — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '') || 1;
  const limit = parseInt(url.searchParams.get('limit') || '') || 20;
  return json(await getTransactions(actor.tenantId!, params!.studentId, page, limit));
});
