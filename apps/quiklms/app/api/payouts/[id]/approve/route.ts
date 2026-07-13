import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { approve } from '@/lib/services/payouts-service';

// PATCH /api/payouts/:id/approve — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await approve(actor.orgId!, params!.id, actor.id));
});
