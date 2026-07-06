import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { markAsRead } from '@/lib/services/messages-service';

// PATCH /api/messages/conversations/:id/read
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await markAsRead(actor.tenantId ?? '', params!.id, actor.id));
});
