import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeamStats } from '@/lib/services/manager-service';

// GET /api/manager/team-stats — MANAGER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const stats = await getTeamStats(user.id, user.orgId as string);
  return json({ success: true, data: stats, message: 'Team stats fetched successfully' });
});
