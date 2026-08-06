/**
 * GET /api/support/tickets/[id] — detail + response thread for ONE ticket the
 * caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`,
 * so a ticket belonging to another user or org is indistinguishable from a
 * ticket that does not exist (404) — no existence oracle.
 */

import { NextResponse } from "next/server";
import { withMemberAuth } from "@/lib/api/withMemberAuth";
import { getSupportTicketDetail } from "@quikit/shared/supportTickets";

export const GET = withMemberAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const result = await getSupportTicketDetail({ orgId, userId, id: params.id });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data });
  },
);
