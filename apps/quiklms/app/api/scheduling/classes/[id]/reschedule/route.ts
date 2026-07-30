import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { rescheduleClass } from '@/lib/services/scheduling-service';

const schema = z.object({
  newStartTime: z.string(),
  newEndTime: z.string(),
  reason: z.string(),
  newLocation: z.string().optional(),
});

// PATCH /api/scheduling/classes/:id/reschedule — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await rescheduleClass(actor.orgId!, params!.id, dto));
});
