import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { archiveConversation } from '@/lib/services/messages-service';

// PATCH /api/messages/conversations/:id/archive
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await archiveConversation(actor.tenantId ?? '', params!.id, actor.id));
});
