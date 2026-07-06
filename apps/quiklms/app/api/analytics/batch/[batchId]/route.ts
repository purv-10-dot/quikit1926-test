import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getBatchAnalytics } from '@/lib/services/analytics-service';

// GET /api/analytics/batch/:batchId — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  return json(await getBatchAnalytics(actor.tenantId ?? '', params!.batchId));
});
