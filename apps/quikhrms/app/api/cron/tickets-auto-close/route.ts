import { NextRequest, NextResponse } from "next/server";
import { runAutoCloseSweep } from "@/lib/services/ticket-cron";

/**
 * Manual trigger for auto-close sweep. The primary scheduler is BullMQ
 * (worker/schedulers.ts) running daily at 03:00. This endpoint stays for:
 *   - manual re-run on demand
 *   - external cron fallback (e.g. Vercel Cron) during transition
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
    const result = await runAutoCloseSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("GET /cron/tickets-auto-close error:", e);
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
