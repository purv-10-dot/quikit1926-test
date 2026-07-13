import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { reject } from '@/lib/services/payouts-service';

// PATCH /api/payouts/:id/reject — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await reject(actor.orgId!, params!.id));
});
