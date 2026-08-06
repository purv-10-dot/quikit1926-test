/**
 * GET /api/support/tickets/[id] — detail + response thread for ONE ticket the
 * caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`,
 * so a ticket belonging to another user or org is indistinguishable from a
 * ticket that does not exist (404) — no existence oracle.
 */

import { withOrgAuth } from "@/lib/orgAuth";
import { getSupportTicketDetail } from "@quikit/shared/supportTickets";

export const GET = withOrgAuth(async (_req, { orgId, userId }, params) => {
  const result = await getSupportTicketDetail({ orgId, userId, id: params.id });
  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }
  return Response.json({ success: true, data: result.data });
});
