import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createTask } from '@/lib/services/non-teaching-work-service';

const schema = z.object({
  teacherId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: z.enum(['curriculum', 'content', 'training', 'meeting', 'other']).optional(),
  paymentAmount: z.number().min(0),
  dueDate: z.string().optional(),
});

// POST /api/non-teaching-work — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json({ success: true, data: await createTask(actor.tenantId!, actor.id, dto) });
});
