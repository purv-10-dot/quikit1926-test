import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { markPaid } from '@/lib/services/payouts-service';

const schema = z.object({
  paymentMethod: z.string(),
  paymentReference: z.string(),
});

// PATCH /api/payouts/:id/pay — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await markPaid(actor.orgId!, params!.id, dto));
});
