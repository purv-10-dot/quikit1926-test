import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getHomeworkStats } from '@/lib/services/homework-service';

// GET /api/homework/:id/stats — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getHomeworkStats(actor.tenantId!, params!.id));
});
