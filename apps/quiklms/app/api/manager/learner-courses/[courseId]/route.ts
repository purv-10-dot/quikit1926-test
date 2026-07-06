import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLearnersByCourse } from '@/lib/services/manager-service';

// GET /api/manager/learner-courses/:courseId — MANAGER
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const data = await getLearnersByCourse(user.id, user.tenantId as string, params!.courseId);
  return json({ success: true, data, message: 'Learner course detail fetched successfully' });
});
