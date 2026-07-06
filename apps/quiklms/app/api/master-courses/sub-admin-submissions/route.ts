import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// GET /api/master-courses/sub-admin-submissions — TENANT_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await svc.findSubAdminSubmissions(actor.tenantId);
  return json({ success: true, data });
});
