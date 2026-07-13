import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { unarchiveConversation } from '@/lib/services/messages-service';

// PATCH /api/messages/conversations/:id/unarchive
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await unarchiveConversation(actor.orgId ?? '', params!.id, actor.id));
});
