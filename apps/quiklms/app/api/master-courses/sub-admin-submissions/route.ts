import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// GET /api/master-courses/sub-admin-submissions — TENANT_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const data = await svc.findSubAdminSubmissions(actor.orgId);
  return json({ success: true, data });
});
