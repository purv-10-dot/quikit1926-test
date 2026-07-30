import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { close } from '@/lib/services/homework-service';

// PATCH /api/homework/:id/close — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await close(actor.orgId!, params!.id));
});
