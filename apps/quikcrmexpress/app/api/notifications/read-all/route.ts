/**
 * PATCH /api/notifications/read-all
 *
 * Mark every unread notification as read for the authenticated user.
 * Used by the "Mark all as read" button in the notification center.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { markAllRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function PATCH() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const count = await markAllRead(user.orgId, user.userId);
    return NextResponse.json({ success: true, data: { count } });
  } catch (e) {
    return errorResponse(e);
  }
}
