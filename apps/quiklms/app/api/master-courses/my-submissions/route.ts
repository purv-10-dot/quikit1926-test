import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// GET /api/master-courses/my-submissions — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const rows = svc.isPrimaryTenantAdmin(actor)
    ? await svc.findBySubmittedTenant(actor.orgId)
    : await svc.findBySubmittedUser(actor.id);
  const data = await svc.enrichCoursesWithPresignedUrls(rows);
  return json({ success: true, data });
});
