import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { forwardMessage } from '@/lib/services/messages-service';
import { emitToConversation } from '@/lib/worker-emit';

const schema = z.object({ targetConversationId: z.string() });

// POST /api/messages/msg/:messageId/forward
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { targetConversationId } = await parseBody(req, schema);
  const message = await forwardMessage(
    actor.orgId ?? '',
    params!.messageId,
    actor.id,
    targetConversationId,
  );

  // A forward is a send into the DESTINATION conversation — broadcast there.
  const res = json(message);
  emitToConversation(targetConversationId, 'newMessage', {
    message,
    conversationId: targetConversationId,
  });
  emitToConversation(targetConversationId, 'conversationUpdated', {
    conversationId: targetConversationId,
    lastMessageText: message.text?.substring(0, 100),
    lastMessageAt: message.createdAt ?? new Date().toISOString(),
    lastMessageBy: actor.id,
  });
  return res;
});
