import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getBatchUtilization } from '@/lib/services/analytics-service';

// GET /api/analytics/batch-utilization — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getBatchUtilization(actor.tenantId ?? ''));
});
