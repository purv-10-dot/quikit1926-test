import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { reactToMessage } from '@/lib/services/messages-service';

const schema = z.object({ emoji: z.string() });

// POST /api/messages/msg/:messageId/react — toggle a reaction
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { emoji } = await parseBody(req, schema);
  return json(await reactToMessage(actor.tenantId ?? '', params!.messageId, actor.id, emoji));
});
