import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAssignedCourses } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/courses?orgId= — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const queryTenantId = new URL(req.url).searchParams.get('orgId') || undefined;
  let orgId: string | null | undefined = user.orgId;
  if (user.role === 'SUPER_ADMIN') {
    if (queryTenantId) orgId = queryTenantId;
    else if (!orgId) orgId = null;
  }
  if ((user.role === 'TENANT_ADMIN' || user.role === 'SUB_ADMIN') && !orgId) throw BadRequest('Tenant ID is required');

  return json({ success: true, data: await getAssignedCourses(orgId) });
});
