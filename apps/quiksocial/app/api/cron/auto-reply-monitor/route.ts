/**
 * GET /api/cron/auto-reply-monitor
 *
 * Triggered every 60s by Railway cron / external scheduler with
 * `Authorization: Bearer ${CRON_SECRET}`. Matches the auth pattern from
 * /api/cron/publish-scheduled.
 *
 * Iterates every active facebook/instagram SocialAccount in the default
 * org and asks the Python AI service to enqueue a monitor task for it.
 * One Celery task per (orgId, socialAccountId) per tick.
 *
 * If the Python service is down or one enqueue fails, the loop continues
 * with the next account. Tick reports total enqueued and any failures.
 *
 * Org scope: single-org via DEFAULT_ORG_ID (DEFAULT_TENANT_ID accepted as
 * fallback for env files that haven't been renamed yet). Multi-org cron
 * lands later, same as publish-scheduled.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueAutoReplyMonitor } from "@/lib/auto-reply/ai-service-client";

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.DEFAULT_TENANT_ID ||
  "org_quiksocial_default";

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

  const orgId = DEFAULT_ORG_ID;

  // Only platforms the responder/graph client supports in Phase 1.
  const accounts = await db.socialAccount.findMany({
    where: {
      orgId,
      isActive: true,
      platform: { in: ["facebook", "instagram"] },
    },
    select: { id: true },
  });

  const results = {
    accountsScanned: accounts.length,
    enqueued: 0,
    failed: 0,
    errors: [] as Array<{ socialAccountId: string; error: string }>,
  };

  for (const account of accounts) {
    const out = await enqueueAutoReplyMonitor(orgId, account.id);
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
