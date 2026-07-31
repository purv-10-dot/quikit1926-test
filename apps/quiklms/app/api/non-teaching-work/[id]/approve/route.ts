import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { approveTask } from '@/lib/services/non-teaching-work-service';

// PATCH /api/non-teaching-work/:id/approve — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await approveTask(actor.orgId!, params!.id, actor.id) });
});
