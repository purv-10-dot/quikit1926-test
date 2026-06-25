/**
 * GET /api/notifications/digest/daily
 * POST /api/notifications/digest/daily   (alias — for manual admin triggers)
 *
 * Daily leadership-digest cron endpoint (Phase 5, step-1 plumbing).
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 *  Auth pattern CLONED VERBATIM from /api/notifications/tasks/daily:
 *    • Authorization: Bearer <CRON_SECRET>  — standard Vercel cron header
 *    • x-cron-secret: <CRON_SECRET>         — convenience header for manual triggers
 *  When CRON_SECRET is not set: development allowed, production blocked (401).
 *
 * ─── Vercel Cron ─────────────────────────────────────────────────────────────
 *  NOT yet wired in vercel.json — the deployed-fire entry is held pending
 *  explicit approval (it's the outward-facing bit). This route is invokable
 *  manually (and by a cron once the schedule is added).
 *
 * ─── Demo state ──────────────────────────────────────────────────────────────
 *  runDailyDigest currently assembles ALL-TIME data (window unit (i) deferred).
 *  The response surfaces `isDemo: true` so callers see the demo state honestly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { runDailyDigest } from "@/lib/services/notifications/digest-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — cross-tenant sweep, matches tasks/daily

// ─── Auth (verbatim from tasks/daily) ───────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[digest-cron] CRON_SECRET is not set — blocking request in production.");
      return false;
    }
    return true;
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const manual = req.headers.get("x-cron-secret");
  return manual === secret;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.info(`[digest-cron] Starting daily digest at ${new Date().toISOString()}`);

  try {
    const result = await runDailyDigest();
    const durationMs = Date.now() - t0;
    console.info(`[digest-cron] daily digest complete in ${durationMs}ms`, {
      digests: result.digests.length,
      sent: result.sentCount,
      errors: result.errorCount,
      isDemo: result.isDemo,
    });
    return NextResponse.json({
      ok: true,
      digestCount: result.digests.length, // recipients RESOLVED
      sentCount: result.sentCount, // sends that SUCCEEDED
      errorCount: result.errorCount, // sends that FAILED (visible, not a dropped digest)
      isDemo: result.isDemo,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Digest run failed";
    console.error("[digest-cron] Fatal error:", err);
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - t0 }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle; // Allow manual triggers via POST.
