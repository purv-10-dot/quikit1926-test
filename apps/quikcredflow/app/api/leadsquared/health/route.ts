/**
 * Admin-only health surface for the LeadSquared sync: queue depths, dead-letter
 * jobs, and process counters. Uses the DB-revalidated auth (Pattern B) and
 * gates on Administrator — there is no dedicated permission module for this.
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getLeadSquaredHealth } from "@/lib/services/leadsquared/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user; // 401
    if (user.role !== "Administrator") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const health = await getLeadSquaredHealth();
    return NextResponse.json({ success: true, data: health });
  } catch (e) {
    return errorResponse(e);
  }
}
