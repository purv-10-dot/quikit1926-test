/**
 * Support ticket detail for QuikCRMExpress.
 *
 * Store + tenant scoping live in @quikit/shared/supportTickets; this file only
 * supplies the app's auth guard. Ported from quiktrack, with its local
 * withOrgAuth wrapper swapped for this app's requireApiUser guard.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupportTicketDetail } from "@quikit/shared/supportTickets";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const result = await getSupportTicketDetail({
      orgId: user.orgId,
      userId: user.userId,
      id: params.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
