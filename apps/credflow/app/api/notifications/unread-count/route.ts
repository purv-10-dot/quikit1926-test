/**
 * GET /api/notifications/unread-count
 *
 * Fast endpoint for the bell badge. Returns only the unread count so the
 * client doesn't have to fetch the full list on every poll.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getUnreadCount } from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const count = await getUnreadCount(user.orgId, user.userId);
    return NextResponse.json({ count });
  } catch (e) {
    return errorResponse(e);
  }
}
