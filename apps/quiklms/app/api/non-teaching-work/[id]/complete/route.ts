import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { markComplete } from '@/lib/services/non-teaching-work-service';

const schema = z.object({
  completionNotes: z.string().optional(),
  hoursSpent: z.number().min(0).optional(),
  attachmentUrls: z.array(z.string()).optional(),
});

// PATCH /api/non-teaching-work/:id/complete — TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  const dto = await parseBody(req, schema);
  return json({ success: true, data: await markComplete(actor.orgId!, params!.id, actor.id, dto) });
});
