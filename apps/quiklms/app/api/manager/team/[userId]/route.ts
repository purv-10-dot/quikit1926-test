import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getUserDetails } from '@/lib/services/manager-service';

// GET /api/manager/team/:userId — MANAGER
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const data = await getUserDetails(user.id, user.orgId as string, params!.userId);
  return json({ success: true, data, message: 'User details fetched successfully' });
});
