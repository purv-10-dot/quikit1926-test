/**
 * POST /api/email/mailbox/sync
 *
 * Manual "Sync now" for the CURRENT user's mailbox — same per-mailbox path the
 * cron uses, but scoped to the caller's own connection only. Handy for demos
 * and for pulling a just-received reply without waiting for the 5-min tick.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getActiveConnection } from "@/lib/services/email/mailbox";
import { syncMailbox } from "@/lib/services/email/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const conn = await getActiveConnection(user.orgId, user.userId);
    const result = await syncMailbox(conn);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
