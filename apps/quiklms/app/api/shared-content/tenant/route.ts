import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getSharedContentForTenant } from '@/lib/services/shared-content-service';

// GET /api/shared-content/tenant — any authenticated user (no @Roles on legacy handler)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await getSharedContentForTenant(actor.tenantId);
  return json({ success: true, data });
});
