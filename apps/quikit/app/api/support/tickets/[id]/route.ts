/**
 * GET /api/support/tickets/[id] — detail + response thread for ONE ticket the
 * caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`,
 * so a ticket belonging to another user or org is indistinguishable from a
 * ticket that does not exist (404) — no existence oracle.
 *
 * The super-admin equivalent (any ticket, any org) is
 * `/api/super/support-tickets/[id]`.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupportTicketDetail } from "@quikit/shared/supportTickets";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const orgId = session.user.orgId;
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No organisation selected" },
        { status: 403 },
      );
    }

    const result = await getSupportTicketDetail({
      orgId,
      userId: session.user.id,
      id: params.id,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load support ticket";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
