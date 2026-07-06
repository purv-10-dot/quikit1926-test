import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getUserAssignments } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/users/:userId — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const tenantId = user.tenantId;
  if (!tenantId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await getUserAssignments(tenantId, params!.userId) });
});
