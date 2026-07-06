import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { removeMember } from '@/lib/services/groups-service';

// DELETE /api/groups/:id/members/:memberId — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.tenantId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await removeMember(user.tenantId, params!.id, params!.memberId) });
});
