import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getAllByUser } from '@/lib/services/progress-service';

// GET /api/progress/my — current learner's progress records
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });
  return json({ success: true, data: await getAllByUser(orgId, learnerId) });
});
