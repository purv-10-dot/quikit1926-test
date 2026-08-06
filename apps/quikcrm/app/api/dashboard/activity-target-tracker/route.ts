/**
 * GET /api/dashboard/activity-target-tracker
 *
 * Admin-only tracker: one row per active salesperson with daily/weekly target,
 * today's + this-week's activity counts, remaining, completion %, and status,
 * sorted with the largest shortfall first.
 *
 * Access restricted to Super Admin / Org Admin / CRM Administrator.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { readTzFromHeaders } from "@/lib/services/dashboard/filters";
import { getActivityTargetTracker } from "@/lib/services/dashboard/activity-target-tracker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) {
      return NextResponse.json(
        { success: false, error: "Access restricted to administrators." },
        { status: 403 },
      );
    }

    const tz = readTzFromHeaders(req.headers);
    const data = await getActivityTargetTracker(user.orgId, tz);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
