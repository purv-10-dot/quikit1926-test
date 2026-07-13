import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { remove } from '@/lib/services/batches-service';

// DELETE /api/batches/:id/permanent — TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  await remove(actor.orgId!, params!.id);
  return json({ success: true, message: 'Batch permanently deleted' });
});
