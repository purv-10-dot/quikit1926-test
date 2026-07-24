import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { exportData } from '@/lib/services/analytics-service';

// GET /api/analytics/export?type=&dateFrom=&dateTo= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'school-overview';
  const dateFrom = url.searchParams.get('dateFrom') || undefined;
  const dateTo = url.searchParams.get('dateTo') || undefined;
  return json(await exportData(actor.orgId ?? '', type, dateFrom, dateTo));
});
