import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getForTeacher } from '@/lib/services/tutoring-requests-service';

// GET /api/tutoring-requests/teacher — TEACHER (assigned + unassigned pending)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json(await getForTeacher(actor.tenantId!, actor.id));
});
