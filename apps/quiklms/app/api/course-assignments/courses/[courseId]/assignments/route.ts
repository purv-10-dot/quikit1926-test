import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getCourseAssignments } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/courses/:courseId/assignments — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await getCourseAssignments(orgId, params!.courseId) });
});
