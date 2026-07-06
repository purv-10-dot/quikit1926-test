import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { generateClasses } from '@/lib/services/scheduling-service';

const schema = z.object({
  batchId: z.string(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

// POST /api/scheduling/classes/generate — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await generateClasses(actor.tenantId!, dto));
});
