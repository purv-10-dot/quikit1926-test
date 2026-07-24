import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { editMessage, deleteMessage } from '@/lib/services/messages-service';
import { emitToConversation } from '@/lib/worker-emit';

const editSchema = z.object({ text: z.string() });

// PATCH /api/messages/msg/:messageId — edit own message
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const messageId = params!.messageId;
  const { text } = await parseBody(req, editSchema);
  const updated = await editMessage(actor.orgId ?? '', messageId, actor.id, text);

  const res = json(updated);
  // Client listener expects { messageId, text, editedAt, conversationId }.
  if (updated?.conversationId) {
    emitToConversation(updated.conversationId, 'messageEdited', {
      messageId,
      text: updated.text,
      editedAt: updated.editedAt,
      conversationId: updated.conversationId,
    });
  }
  return res;
});

// DELETE /api/messages/msg/:messageId — delete own message
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const messageId = params!.messageId;
  const result = await deleteMessage(actor.orgId ?? '', messageId, actor.id);

  const res = json(result);
  // The service returns only { success, messageId }, so the room to broadcast
  // into has to be looked up — same thing the legacy controller did after its
  // delete. It is a soft delete, so the row is still there. Wrapped in
  // try/catch: a failed lookup must never turn a successful delete into a 500.
  try {
    const row = await prisma.lmsMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (row?.conversationId) {
      emitToConversation(row.conversationId, 'messageDeleted', {
        messageId,
        conversationId: row.conversationId,
      });
    }
  } catch {
    /* broadcast is best-effort — the delete already succeeded */
  }
  return res;
});
