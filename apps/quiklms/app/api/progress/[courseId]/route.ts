import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getProgress } from '@/lib/services/progress-service';

// GET /api/progress/:courseId
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });
  const progress = await getProgress(orgId, learnerId, params!.courseId);
  return json({ success: true, data: progress });
});
