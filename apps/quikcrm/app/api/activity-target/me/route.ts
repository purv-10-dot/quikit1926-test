/**
 * GET /api/activity-target/me
 *
 * The LOGGED-IN user's own activity-target data (self-service). There is no
 * userId parameter — the target user is always `user.userId` from the session,
 * so a caller can never read anyone else's data. No admin gate: any
 * authenticated user may call it, but they only ever see themselves, and an
 * unassigned user gets { assigned: false }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { readTzFromHeaders } from "@/lib/services/dashboard/filters";
import { getMyActivityTarget } from "@/lib/services/dashboard/my-activity-target-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const tz = readTzFromHeaders(req.headers);
    const data = await getMyActivityTarget(user.orgId, user.userId, tz);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
