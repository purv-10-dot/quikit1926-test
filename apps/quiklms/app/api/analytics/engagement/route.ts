import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getEngagementAnalytics } from '@/lib/services/analytics-service';

// GET /api/analytics/engagement?days= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const days = url.searchParams.get('days') ? parseInt(url.searchParams.get('days')!) : 30;
  return json(await getEngagementAnalytics(actor.tenantId ?? '', days));
});
