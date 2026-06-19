/**
 * GET /api/cron/auto-reply-monitor
 *
 * Triggered every 60s by Railway cron / external scheduler with
 * `Authorization: Bearer ${CRON_SECRET}`. Matches the auth pattern from
 * /api/cron/publish-scheduled.
 *
 * Iterates every active facebook/instagram SocialAccount across ALL orgs
 * and asks the Python AI service to enqueue a monitor task for each. One
 * Celery task per (orgId, socialAccountId) per tick; the orgId comes from
 * each SocialAccount row itself, so the responder stays org-correct.
 *
 * If the Python service is down or one enqueue fails, the loop continues
 * with the next account. Tick reports total enqueued and any failures.
 *
 * Org scope: all orgs in one sweep (per-row orgId on SocialAccount drives
 * the enqueue). Mirrors the production-proven standalone.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueAutoReplyMonitor } from "@/lib/auto-reply/ai-service-client";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/auto-reply-monitor] CRON_SECRET env var is not set");
    return NextResponse.json(
      { success: false, error: "Cron not configured", code: "CRON_NOT_CONFIGURED" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // All-orgs sweep: scan every active fb/ig account; each account's own
  // orgId drives the enqueue so the responder stays org-correct. Only
  // platforms the responder/graph client supports in Phase 1.
  const accounts = await db.socialAccount.findMany({
    where: {
      isActive: true,
      platform: { in: ["facebook", "instagram"] },
    },
    select: { id: true, orgId: true },
  });

  const results = {
    accountsScanned: accounts.length,
    enqueued: 0,
    failed: 0,
    errors: [] as Array<{ socialAccountId: string; error: string }>,
  };

  for (const account of accounts) {
    const out = await enqueueAutoReplyMonitor(account.orgId, account.id);
    if (out.ok) {
      results.enqueued++;
    } else {
      results.failed++;
      results.errors.push({ socialAccountId: account.id, error: out.error });
      console.warn(
        "[cron/auto-reply-monitor] Enqueue failed",
        account.id,
        out.error.slice(0, 200),
      );
    }
  }

  return NextResponse.json({ success: true, data: { ok: true, ...results } });
}
