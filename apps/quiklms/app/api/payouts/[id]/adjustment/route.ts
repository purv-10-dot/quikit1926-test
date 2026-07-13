import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { addAdjustment } from '@/lib/services/payouts-service';

const schema = z.object({
  type: z.enum(['bonus', 'deduction', 'reimbursement']),
  amount: z.number(),
  reason: z.string(),
});

// POST /api/payouts/:id/adjustment — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await addAdjustment(actor.orgId!, params!.id, dto, actor.id));
});
