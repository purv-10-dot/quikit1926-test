/**
 * GET /api/support/tickets/[id] — detail + response thread for ONE ticket the
 * caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`,
 * so a ticket belonging to another user or org is indistinguishable from a
 * ticket that does not exist (404) — no existence oracle.
 */

import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getSupportTicketDetail } from '@quikit/shared/supportTickets';

export const GET = route(async (req, ctx) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const result = await getSupportTicketDetail({
    orgId: actor.orgId,
    userId: actor.id,
    id: String(ctx.params?.id ?? ''),
  });
  if (!result.ok) return json({ success: false, error: result.error }, result.status);

  return json({ success: true, data: result.data });
});
