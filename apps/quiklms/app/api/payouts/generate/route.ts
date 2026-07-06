import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { generatePayouts } from '@/lib/services/payouts-service';

const schema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  perClassRate: z.number().optional(),
});

// POST /api/payouts/generate — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await generatePayouts(actor.tenantId!, dto));
});
