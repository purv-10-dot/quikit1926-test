/**
 * POST /api/email/mailbox/disconnect
 *
 * Disconnects the CURRENT user's mailbox (best-effort provider token revoke,
 * then clears stored tokens + marks disconnected). Scoped to org + userId so a
 * user can only disconnect their own mailbox. Idempotent.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { disconnect } from "@/lib/services/email/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    await disconnect(user.orgId, user.userId);
    return NextResponse.json({ success: true, data: { disconnected: true } });
  } catch (e) {
    return errorResponse(e);
  }
}
