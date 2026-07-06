import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { refundCredits } from '@/lib/services/credits-service';

const schema = z.object({
  packageId: z.string(),
  amount: z.number().min(1),
  reason: z.string(),
  notes: z.string().optional(),
});

// POST /api/credits/refund — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await refundCredits(actor.tenantId!, dto, actor.id));
});
