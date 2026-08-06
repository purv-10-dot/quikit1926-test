/**
 * GET /api/reports/canned — list canned report metadata.
 *
 * Returns the 15-card catalog in display order, stripped of the
 * non-serialisable `run` / `buildDrillUrl` callbacks. Permission-gated
 * on `reports.view` — admins always pass via the matrix backwards-compat
 * clause in `assertModule`.
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { CANNED_REPORTS, summariseCanned } from "@/lib/services/reports/canned";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    return NextResponse.json({
      success: true,
      data: { items: CANNED_REPORTS.map(summariseCanned) },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
