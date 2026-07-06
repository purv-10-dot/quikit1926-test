import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/tenant-approve — TENANT_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const course = await svc.tenantApprove(params!.id, actor.id, actor.tenantId);
  return json({ success: true, data: course, message: 'Course approved and forwarded to Super Admin' });
});
