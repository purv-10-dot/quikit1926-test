import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create } from '@/lib/services/tutoring-requests-service';

const slot = z.object({ date: z.string(), startTime: z.string(), endTime: z.string() });
const schema = z.object({
  subject: z.string(),
  notes: z.string().optional(),
  proposedSlots: z.array(slot),
  teacherId: z.string().optional(),
});

// POST /api/tutoring-requests — LEARNER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const dto = await parseBody(req, schema);
  return json(await create(actor.orgId!, actor.id, dto));
});
