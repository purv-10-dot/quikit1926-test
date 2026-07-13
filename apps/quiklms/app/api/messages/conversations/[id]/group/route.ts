import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateGroup } from '@/lib/services/messages-service';

const schema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  groupIcon: z.string().optional(),
});

// PATCH /api/messages/conversations/:id/group — update group settings (admin only)
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const dto = await parseBody(req, schema);
  return json(await updateGroup(actor.orgId ?? '', params!.id, actor.id, dto));
});
