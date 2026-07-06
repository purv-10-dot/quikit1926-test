import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherTasks } from '@/lib/services/non-teaching-work-service';

// GET /api/non-teaching-work/teacher — TEACHER (own tasks)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json({ success: true, data: await getTeacherTasks(actor.tenantId!, actor.id) });
});
