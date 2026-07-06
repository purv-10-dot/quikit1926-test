import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLearnerDetail } from '@/lib/services/manager-service';

// GET /api/manager/learner-detail/:userId — MANAGER
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const detail = await getLearnerDetail(user.id, user.tenantId as string, params!.userId);
  return json({ success: true, data: detail, message: 'Learner detail fetched successfully' });
});
