import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getArchivedConversations } from '@/lib/services/messages-service';

// GET /api/messages/conversations/archived
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  return json(await getArchivedConversations(actor.orgId ?? '', actor.id));
});
