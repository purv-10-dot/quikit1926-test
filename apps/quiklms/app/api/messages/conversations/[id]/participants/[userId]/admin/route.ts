import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { makeAdmin } from '@/lib/services/messages-service';

// PATCH /api/messages/conversations/:id/participants/:userId/admin — promote to admin
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await makeAdmin(actor.orgId ?? '', params!.id, actor.id, params!.userId));
});
