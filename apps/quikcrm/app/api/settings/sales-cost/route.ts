/**
 * GET /api/settings/sales-cost?period=YYYY-MM&userId=<id>
 *
 * The Sales Cost page's main read. Returns the selectable sales reps plus — when
 * `userId` is given — that rep's full cost breakdown and efficiency for the
 * period. Without `userId` it returns the all-reps summary table.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator) via
 * requireSalesCostAdmin. Salary figures are never returned to a non-admin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { currentPeriod, parsePeriod, recentPeriods } from "@/lib/services/sales-cost/period";
import {
  getOrgSummary,
  getRepBreakdown,
  listOtherCosts,
  listSalaryHistory,
  listSalesReps,
  listTools,
} from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const url = new URL(req.url);
    const periodParam = url.searchParams.get("period");
    const userId = url.searchParams.get("userId");

    // An unparseable period is a 400 rather than a silent fall back to the
    // current month — a typo'd report URL must not look like real data.
    const period = periodParam ? parsePeriod(periodParam) : currentPeriod();
    if (!period) {
      return NextResponse.json(
        { success: false, error: "Invalid period. Expected YYYY-MM." },
        { status: 400 },
      );
    }

    const reps = await listSalesReps(user.orgId);

    if (!userId) {
      const summary = await getOrgSummary(user.orgId, period);
      return NextResponse.json({
        success: true,
        data: {
          period: period.key,
          periods: recentPeriods(),
          reps,
          summary: summary.rows,
          breakdown: null,
        },
      });
    }

    // Reject a userId outside this org before doing any cost work, so the
    // endpoint cannot be used to probe another org's membership.
    const rep = reps.find((r) => r.userId === userId);
    if (!rep) {
      return NextResponse.json(
        { success: false, error: "That user is not a QuikCRM user in this organization." },
        { status: 404 },
      );
    }

    const [breakdown, tools, otherCosts, salaryHistory] = await Promise.all([
      getRepBreakdown(user.orgId, userId, period, rep.name),
      // The period is passed so each tool reports `currentPrice` — the version
      // in force for that month, not merely its latest price.
      listTools(user.orgId, { userId, period }),
      listOtherCosts(user.orgId, { userId }),
      listSalaryHistory(user.orgId, userId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        period: period.key,
        periods: recentPeriods(),
        reps,
        summary: null,
        breakdown,
        tools,
        otherCosts,
        salaryHistory,
      },
    });
  } catch (e) {
    return salesCostError(e);
  }
}
