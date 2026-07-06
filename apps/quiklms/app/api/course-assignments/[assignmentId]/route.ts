import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { removeAssignment } from '@/lib/services/course-assignments-service';

// DELETE /api/course-assignments/:assignmentId — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const tenantId = user.tenantId;
  if (!tenantId) throw BadRequest('Tenant ID is required');
  await removeAssignment(tenantId, params!.assignmentId);
  return json({ success: true, message: 'Assignment removed successfully' });
});
