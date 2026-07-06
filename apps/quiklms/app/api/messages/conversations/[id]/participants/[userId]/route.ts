import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { removeParticipant } from '@/lib/services/messages-service';

// DELETE /api/messages/conversations/:id/participants/:userId — remove/leave
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await removeParticipant(actor.tenantId ?? '', params!.id, actor.id, params!.userId));
});
