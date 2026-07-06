import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { markCompleted } from '@/lib/services/tutoring-requests-service';

// PATCH /api/tutoring-requests/:id/complete — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await markCompleted(actor.tenantId!, params!.id));
});
