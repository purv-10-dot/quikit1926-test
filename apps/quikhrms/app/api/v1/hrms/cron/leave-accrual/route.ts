import { NextRequest, NextResponse } from "next/server";
import { runMonthlyAccrual, runYearEndCarryForward } from "@/lib/services/leave-accrual";

/**
 * POST /api/v1/hrms/cron/leave-accrual
 *
 * Run on the 1st of every month (scheduler / cron). It:
 *  • accrues one month of leave for all Monthly-accrual leave types, and
 *  • in January, also runs the previous year's carry-forward / lapse.
 *
 * Manual/backfill: pass a JSON body to force a specific run —
 *   { "carryForwardYear": 2025 }  → only run carry-forward for 2025
 *   { "skipAccrual": true }        → skip the monthly accrual step
 * Auth: x-cron-secret header must match CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({} as { carryForwardYear?: number; skipAccrual?: boolean }));
    const now = new Date();

    const accrual = body.skipAccrual ? null : await runMonthlyAccrual(now);

    let carryForward = null;
    if (typeof body.carryForwardYear === "number") {
      carryForward = await runYearEndCarryForward(body.carryForwardYear);
    } else if (now.getUTCMonth() === 0) {
      // January → roll over the year that just ended.
      carryForward = await runYearEndCarryForward(now.getUTCFullYear() - 1);
    }

    return NextResponse.json({ success: true, data: { accrual, carryForward } });
  } catch (error) {
    console.error("POST /cron/leave-accrual error:", error);
    const message = error instanceof Error ? error.message : "Leave accrual failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
