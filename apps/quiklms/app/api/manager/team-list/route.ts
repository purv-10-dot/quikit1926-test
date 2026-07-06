import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeamList } from '@/lib/services/manager-service';

// GET /api/manager/team-list — MANAGER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const teamList = await getTeamList(user.id, user.tenantId as string);
  return json({ success: true, data: teamList, message: 'Team list fetched successfully' });
});
