import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { allocateCredits } from '@/lib/services/credits-service';

const schema = z.object({
  studentId: z.string(),
  packageName: z.string(),
  credits: z.number().min(1),
  price: z.number().optional(),
  validityMonths: z.number().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/credits/allocate — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await allocateCredits(actor.orgId!, dto, actor.id));
});
