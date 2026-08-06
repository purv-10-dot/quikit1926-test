import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getSchoolOverview } from '@/lib/services/analytics-service';

// GET /api/analytics/school?dateFrom=&dateTo= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const dateFrom = url.searchParams.get('dateFrom') || undefined;
  const dateTo = url.searchParams.get('dateTo') || undefined;
  return json(await getSchoolOverview(actor.orgId ?? '', dateFrom, dateTo));
});
