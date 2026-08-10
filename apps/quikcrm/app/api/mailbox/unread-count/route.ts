/**
 * GET /api/mailbox/unread-count — unread inbox count for the sidebar badge.
 * DB-only; own-mailbox scoped.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { callerConnectionId, unreadCount } from "@/lib/services/email/mailbox-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Personal mailbox: authentication is the only gate (own-connection scoped).
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const connectionId = await callerConnectionId(user.orgId, user.userId);
    const count = connectionId ? await unreadCount(user.orgId, connectionId) : 0;
    return NextResponse.json({ success: true, data: { count } });
  } catch (e) {
    return errorResponse(e);
  }
}
