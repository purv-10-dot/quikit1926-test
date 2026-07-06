import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getQuizResults } from '@/lib/services/manager-service';

// GET /api/manager/quiz-results/:userId/:courseId — MANAGER
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const results = await getQuizResults(params!.userId, params!.courseId, user.id, user.tenantId as string);
  return json({ success: true, data: results, message: 'Quiz results fetched successfully' });
});
