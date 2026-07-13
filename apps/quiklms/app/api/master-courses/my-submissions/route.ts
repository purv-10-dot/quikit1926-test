import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, type AuthUser } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

const isPrimaryTenantAdmin = (u: AuthUser) => u.role === 'TENANT_ADMIN';

// GET /api/master-courses/my-submissions — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const data = isPrimaryTenantAdmin(actor)
    ? await svc.findBySubmittedTenant(actor.orgId)
    : await svc.findBySubmittedUser(actor.id);
  return json({ success: true, data });
});
