import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { update } from '@/lib/services/batches-service';

// PATCH /api/batches/:id/unarchive — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await update(actor.tenantId!, params!.id, { status: 'active' }));
});
