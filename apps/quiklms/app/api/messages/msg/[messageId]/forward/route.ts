import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { forwardMessage } from '@/lib/services/messages-service';

const schema = z.object({ targetConversationId: z.string() });

// POST /api/messages/msg/:messageId/forward
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { targetConversationId } = await parseBody(req, schema);
  return json(await forwardMessage(actor.orgId ?? '', params!.messageId, actor.id, targetConversationId));
});
