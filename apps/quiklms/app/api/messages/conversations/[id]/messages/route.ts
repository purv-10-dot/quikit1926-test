import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getMessages, sendMessage } from '@/lib/services/messages-service';
import { emitToConversation } from '@/lib/worker-emit';

// GET /api/messages/conversations/:id/messages?page=&limit=
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '') || 1;
  const limit = parseInt(url.searchParams.get('limit') || '') || 50;
  return json(await getMessages(actor.orgId ?? '', params!.id, actor.id, page, limit));
});

const sendSchema = z.object({
  text: z.string(),
  attachmentUrls: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  forwardedFrom: z.string().optional(),
});

// POST /api/messages/conversations/:id/messages
// Persists over REST, then asks the worker to broadcast so the OTHER
// participants get the message live instead of only on a refetch.
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const dto = await parseBody(req, sendSchema);
  const conversationId = params!.id;
  const message = await sendMessage(actor.orgId ?? '', conversationId, actor.id, dto);

  // `json()` first — it aliases id → _id in place, so the broadcast payload is
  // byte-identical to what the sender got back. Emits are fire-and-forget.
  const res = json(message);
  emitToConversation(conversationId, 'newMessage', { message, conversationId });
  emitToConversation(conversationId, 'conversationUpdated', {
    conversationId,
    lastMessageText: dto.text?.substring(0, 100),
    lastMessageAt: message.createdAt ?? new Date().toISOString(),
    lastMessageBy: actor.id,
  });
  return res;
});
