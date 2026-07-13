import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getArrReport } from '@/lib/services/analytics-service';

// GET /api/analytics/arr — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getArrReport(actor.orgId ?? ''));
});
