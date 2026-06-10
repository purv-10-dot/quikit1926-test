/**
 * GET /api/notifications/tasks/daily
 * POST /api/notifications/tasks/daily   (alias — for manual admin triggers)
 *
 * Daily task notification cron endpoint.
 *
 * ─── Vercel Cron Schedule ────────────────────────────────────────────────────
 *  Morning (9:00 AM IST = 3:30 AM UTC):  GET ?type=morning   "0 3 * * *"
 *  Evening (5:00 PM IST = 11:30 AM UTC): GET ?type=evening   "30 11 * * *"
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 *  Vercel cron requests are validated via the `Authorization: Bearer <CRON_SECRET>`
 *  header that Vercel injects automatically when CRON_SECRET is set in the project
 *  environment variables.
 *
 *  Manual triggers (from the notifications debug page or Postman) must supply the
 *  same secret via:
 *    • Authorization: Bearer <CRON_SECRET>  — standard
 *    • x-cron-secret: <CRON_SECRET>         — convenience header
 *
 *  When CRON_SECRET is not set:
 *    • development → allowed (open access for local testing)
 *    • production  → blocked (returns 401)
 *
 * ─── Query params ────────────────────────────────────────────────────────────
 *  type = "morning"  → due-today + due-tomorrow reminders  (default)
 *  type = "evening"  → overdue notifications, once per task
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  runMorningTaskNotifications,
  runEveningTaskNotifications,
  type MorningSweepResult,
  type EveningSweepResult,
} from "@/lib/notifications/task-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — cross-tenant sweeps can take time

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // No secret configured — allow in dev, block in production.
    if (process.env.NODE_ENV === "production") {
      console.warn("[task-cron] CRON_SECRET is not set — blocking request in production.");
      return false;
    }
    return true;
  }

  // Standard Vercel cron header.
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  // Convenience header for manual triggers.
  const manual = req.headers.get("x-cron-secret");
  return manual === secret;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "morning").toLowerCase();

  if (type !== "morning" && type !== "evening") {
    return NextResponse.json(
      { error: "Invalid type. Use ?type=morning or ?type=evening." },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  console.info(`[task-cron] Starting ${type} sweep at ${new Date().toISOString()}`);

  let result: MorningSweepResult | EveningSweepResult;
  try {
    result =
      type === "evening"
        ? await runEveningTaskNotifications()
        : await runMorningTaskNotifications();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sweep failed";
    console.error("[task-cron] Fatal sweep error:", err);
    return NextResponse.json(
      { ok: false, sweep: type, error: message, durationMs: Date.now() - t0 },
      { status: 500 },
    );
  }

  const durationMs = Date.now() - t0;
  console.info(`[task-cron] ${type} sweep complete in ${durationMs}ms`, result);

  return NextResponse.json({ ok: true, sweep: type, ...result, durationMs });
}

export const GET  = handle;
export const POST = handle; // Allow manual triggers via POST from the debug page.
