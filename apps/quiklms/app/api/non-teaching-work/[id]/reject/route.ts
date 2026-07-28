import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { rejectTask } from '@/lib/services/non-teaching-work-service';

const schema = z.object({ rejectionReason: z.string().optional() });

// PATCH /api/non-teaching-work/:id/reject — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json({ success: true, data: await rejectTask(actor.orgId!, params!.id, actor.id, dto.rejectionReason) });
});
