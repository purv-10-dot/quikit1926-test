import { NextRequest, NextResponse } from "next/server";
import { runSlaBreachSweep } from "@/lib/services/ticket-cron";

/**
 * Manual trigger for SLA breach sweep. Primary scheduler is BullMQ
 * (worker/schedulers.ts) running hourly. This endpoint stays for:
 *   - manual re-run on demand
 *   - external cron fallback during transition
 *
 * Auth: x-cron-secret header / Bearer token matching env CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // Fail CLOSED: reject when CRON_SECRET is unset.
  if (!secret || (headerSecret !== secret && bearer !== secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSlaBreachSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("GET /cron/tickets-sla-breach error:", e);
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
