/**
 * GET/POST /api/email/cron/sync
 *
 * Vercel Cron entrypoint — sweeps every active mailbox across all orgs and
 * syncs new messages. Scheduled every 5 minutes (see apps/quikcrm/vercel.json).
 *
 * Auth mirrors app/api/notifications/tasks/daily/route.ts exactly:
 *   Authorization: Bearer <CRON_SECRET>  (Vercel injects) OR x-cron-secret header.
 *   No secret set → allowed in dev, blocked in production.
 */

import { NextResponse, type NextRequest } from "next/server";
import { runEmailSync } from "@/lib/services/email/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cross-org sweep can take time

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[email:cron] CRON_SECRET not set — blocking request in production.");
      return false;
    }
    return true;
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const result = await runEmailSync();
    const durationMs = Date.now() - t0;
    const totals = result.results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        created: acc.created + r.created,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + (r.error ? 1 : 0),
      }),
      { fetched: 0, created: 0, skipped: 0, errors: 0 },
    );
    console.info(`[email:cron] sweep done in ${durationMs}ms`, {
      ranSweep: result.ranSweep,
      mailboxes: result.mailboxes,
      ...totals,
    });
    return NextResponse.json({ ok: true, ...result, ...totals, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sweep failed";
    console.error("[email:cron] fatal:", err);
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - t0 }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
