import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { muteConversation } from '@/lib/services/messages-service';

// PATCH /api/messages/conversations/:id/mute
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await muteConversation(actor.orgId ?? '', params!.id, actor.id, true));
});
