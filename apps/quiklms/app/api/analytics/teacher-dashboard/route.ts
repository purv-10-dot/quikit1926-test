import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherDashboard } from '@/lib/services/analytics-service';

// GET /api/analytics/teacher-dashboard — TEACHER (self)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json(await getTeacherDashboard(actor.orgId ?? '', actor.id));
});
