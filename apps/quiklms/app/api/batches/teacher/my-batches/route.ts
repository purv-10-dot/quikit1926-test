import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findByTeacher } from '@/lib/services/batches-service';

// GET /api/batches/teacher/my-batches — TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json(await findByTeacher(actor.orgId!, actor.id));
});
