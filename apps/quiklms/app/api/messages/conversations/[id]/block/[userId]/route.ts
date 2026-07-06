import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { blockUser, unblockUser } from '@/lib/services/messages-service';

// POST /api/messages/conversations/:id/block/:userId — block user in conversation
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await blockUser(actor.tenantId ?? '', params!.id, actor.id, params!.userId));
});

// DELETE /api/messages/conversations/:id/block/:userId — unblock
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await unblockUser(actor.tenantId ?? '', params!.id, actor.id, params!.userId));
});
