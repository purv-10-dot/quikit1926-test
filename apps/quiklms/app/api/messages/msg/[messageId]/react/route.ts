import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { reactToMessage } from '@/lib/services/messages-service';
import { emitToConversation } from '@/lib/worker-emit';

const schema = z.object({ emoji: z.string() });

// POST /api/messages/msg/:messageId/react — toggle a reaction
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const messageId = params!.messageId;
  const { emoji } = await parseBody(req, schema);
  const result = await reactToMessage(actor.orgId ?? '', messageId, actor.id, emoji);

  // `json()` first so the reactions in the broadcast carry the same `_id`
  // aliases as the ones returned to the caller.
  const res = json(result);
  // The service returns { messageId, reactions } with no conversationId, so the
  // room is looked up here (as the legacy controller did). Never fatal.
  try {
    const row = await prisma.lmsMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (row?.conversationId) {
      emitToConversation(row.conversationId, 'messageReaction', {
        messageId,
        reactions: result.reactions,
        conversationId: row.conversationId,
      });
    }
  } catch {
    /* broadcast is best-effort — the reaction is already persisted */
  }
  return res;
});
