import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findByStudent } from '@/lib/services/batches-service';

// GET /api/batches/student/my-batches — LEARNER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  return json(await findByStudent(actor.tenantId!, actor.id));
});
