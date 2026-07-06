import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAssignedCourses } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/courses?tenantId= — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const queryTenantId = new URL(req.url).searchParams.get('tenantId') || undefined;
  let tenantId: string | null | undefined = user.tenantId;
  if (user.role === 'SUPER_ADMIN') {
    if (queryTenantId) tenantId = queryTenantId;
    else if (!tenantId) tenantId = null;
  }
  if ((user.role === 'TENANT_ADMIN' || user.role === 'SUB_ADMIN') && !tenantId) throw BadRequest('Tenant ID is required');

  return json({ success: true, data: await getAssignedCourses(tenantId) });
});
