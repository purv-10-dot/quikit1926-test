import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherEscalations } from '@/lib/services/escalations-service';

// GET /api/escalations/teacher — TEACHER (own escalations)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json(await getTeacherEscalations(actor.tenantId!, actor.id));
});
