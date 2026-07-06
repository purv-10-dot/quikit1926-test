import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getProgress } from '@/lib/services/progress-service';

// GET /api/progress/:courseId
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const tenantId = user.tenantId;
  const learnerId = user.id;
  if (!tenantId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });
  const progress = await getProgress(tenantId, learnerId, params!.courseId);
  return json({ success: true, data: progress });
});
