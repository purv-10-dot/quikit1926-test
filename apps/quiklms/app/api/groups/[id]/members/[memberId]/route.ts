import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { removeMember } from '@/lib/services/groups-service';

// DELETE /api/groups/:id/members/:memberId — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await removeMember(user.orgId, params!.id, params!.memberId) });
});
