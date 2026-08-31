/**
 * GET /api/settings/sales-cost/connects-usage?userId=<id>&period=YYYY-MM
 *
 * How many Upwork Connects one sales rep consumed in one month, and what that
 * costs at the org's configured Connects price. Read-only: it aggregates the
 * `connectsUsed` / `boostConnects` columns the Upwork proposal capture already
 * writes, and never modifies an Upwork record.
 *
 * The Add Tool dialog calls this when "Upwork Connects" is chosen, to fill the
 * cost field that the user is not allowed to type by hand.
 *
 * Admin-only, matching every other Sales Cost route: the response exposes one
 * rep's spend.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { parsePeriod } from "@/lib/services/sales-cost/period";
import { getConnectsUsage } from "@/lib/services/sales-cost/connects-usage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    // Required here (unlike the tools list): Connects consumption is only
    // meaningful for a specific month, so there is no sensible "all periods"
    // reading to fall back to.
    const period = parsePeriod(url.searchParams.get("period"));
    if (!period) {
      return NextResponse.json(
        { success: false, error: "Invalid period. Expected YYYY-MM." },
        { status: 400 },
      );
    }

    const data = await getConnectsUsage(user.orgId, userId, period);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}
