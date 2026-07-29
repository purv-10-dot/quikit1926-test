import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getForStudent } from '@/lib/services/tutoring-requests-service';

// GET /api/tutoring-requests/student — LEARNER (own requests)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  return json(await getForStudent(actor.orgId!, actor.id));
});
