import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { checkPrerequisites } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/courses/:courseId/check-prerequisites
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  if (!orgId || !user.id) throw BadRequest('Tenant ID and User ID are required');
  const result = await checkPrerequisites(params!.courseId, user.id, orgId);
  return json({ success: true, data: result });
});
