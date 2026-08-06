import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLearnerCoursesOverview } from '@/lib/services/manager-service';

// GET /api/manager/learner-courses — MANAGER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const data = await getLearnerCoursesOverview(user.id, user.orgId as string);
  return json({ success: true, data, message: 'Learner courses overview fetched successfully' });
});
