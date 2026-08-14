/**
 * GET /api/reports/executive — executive KPI summary for the Reports
 * Overview tab (same data as the dashboard, gated on `reports.view`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { parseFilters } from "@/lib/services/dashboard/filters";
import { buildSummary } from "@/lib/services/dashboard/summary-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    const filters = parseFilters(req, user);
    const summary = await buildSummary(user, {
      range: filters.range,
      resolvedOwnerId: filters.resolvedOwnerId,
      ownerId: filters.ownerId,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    return errorResponse(e);
  }
}
