import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { convertToRegular } from '@/lib/services/demo-analytics-service';

// PATCH /api/demo-analytics/convert/:batchId — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await convertToRegular(actor.tenantId!, params!.batchId) });
});
