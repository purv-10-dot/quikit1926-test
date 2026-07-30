import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getBalanceByParent } from '@/lib/services/credits-service';

// GET /api/credits/balance/:id — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getBalanceByParent(actor.orgId!, params!.id));
});
