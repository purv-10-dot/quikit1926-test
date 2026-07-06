import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { promoteToSubAdmin } from '@/lib/services/users-service';

// PATCH /api/users/:id/promote-subadmin — SUPER_ADMIN | TENANT_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await promoteToSubAdmin(params!.id, actor.tenantId);
  return json({ success: true, data, message: 'Sub Admin role granted successfully' });
});
