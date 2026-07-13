import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { editMessage, deleteMessage } from '@/lib/services/messages-service';

const editSchema = z.object({ text: z.string() });

// PATCH /api/messages/msg/:messageId — edit own message
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { text } = await parseBody(req, editSchema);
  return json(await editMessage(actor.orgId ?? '', params!.messageId, actor.id, text));
});

// DELETE /api/messages/msg/:messageId — delete own message
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await deleteMessage(actor.orgId ?? '', params!.messageId, actor.id));
});
