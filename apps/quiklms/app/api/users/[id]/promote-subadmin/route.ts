import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { promoteToSubAdmin } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

// PATCH /api/users/:id/promote-subadmin — SUPER_ADMIN | TENANT_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const data = await promoteToSubAdmin(params!.id, actor.orgId);
  return json({ success: true, data: await applyTeacherPrivacy(actor, req, data), message: 'Sub Admin role granted successfully' });
});
