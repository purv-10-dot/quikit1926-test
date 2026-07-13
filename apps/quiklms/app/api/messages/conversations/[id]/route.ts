import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getConversation, deleteConversation } from '@/lib/services/messages-service';

// GET /api/messages/conversations/:id
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await getConversation(actor.orgId ?? '', params!.id, actor.id));
});

// DELETE /api/messages/conversations/:id — per-user soft delete
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await deleteConversation(actor.orgId ?? '', params!.id, actor.id));
});
