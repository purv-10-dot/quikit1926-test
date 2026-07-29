import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { completeClass } from '@/lib/services/scheduling-service';

// PATCH /api/scheduling/classes/:id/complete — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await completeClass(actor.orgId!, params!.id));
});
