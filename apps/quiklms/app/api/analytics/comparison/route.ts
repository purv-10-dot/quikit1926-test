import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getPeriodComparison } from '@/lib/services/analytics-service';

// GET /api/analytics/comparison?dateFrom=&dateTo=&metric= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';
  const metric = url.searchParams.get('metric') || undefined;
  return json(await getPeriodComparison(actor.orgId ?? '', dateFrom, dateTo, metric));
});
