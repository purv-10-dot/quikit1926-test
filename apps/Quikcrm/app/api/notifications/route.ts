/**
 * GET /api/notifications
 *
 * Paginated notification list for the authenticated user.
 *
 * Query params:
 *   cursor  — ISO timestamp of the last item on the previous page (optional)
 *   take    — page size, 1–100, defaults to 30
 *
 * Response:
 *   { items, unread, hasMore, nextCursor }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? null;
    const rawTake = Number(searchParams.get("take") ?? "30");
    const take = Number.isFinite(rawTake)
      ? Math.min(Math.max(rawTake, 1), 100)
      : 30;

    const page = await getNotifications(user.orgId, user.userId, cursor, take);
    return NextResponse.json(page);
  } catch (e) {
    return errorResponse(e);
  }
}
