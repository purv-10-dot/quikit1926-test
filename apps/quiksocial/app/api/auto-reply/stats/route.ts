/**
 * GET /api/auto-reply/stats?brandId=<cuid>&windowDays=7
 *
 * Aggregate KPIs for the Auto-Reply dashboard. Window-bounded counts of
 * SENT / FAILED logs across all rules in the brand + current active rule
 * count (rule count is not windowed — it's the "live" state).
 *
 * `successRate` and `avgResponseMs` return `null` when the window has no
 * data so the UI renders "—" instead of "0%" / "0ms" (which would be a
 * misleading 100% failure / instant response).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 422 },
    );
  }

  const requestedWindow = parseInt(searchParams.get("windowDays") ?? "7", 10);
  const windowDays = Math.min(
    90,
    Math.max(1, Number.isFinite(requestedWindow) ? requestedWindow : 7),
  );

  // Verify the brand belongs to this org before running aggregates.
  const brand = await db.brand.findFirst({
    where: { id: brandId, orgId },
    select: { id: true },
  });
  if (!brand) {
    return NextResponse.json(
      { success: false, error: "Brand not found" },
      { status: 404 },
    );
  }

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // 4 parallel queries. The relational filter `rule: { brandId }` joins
  // through AutoReplyRule.brandId — fine for typical rule cardinality
  // (a brand has tens of rules at most).
  const [activeRules, sentCount, failedCount, latencyAgg] = await Promise.all([
    db.autoReplyRule.count({
      where: { orgId, brandId, isActive: true },
    }),
    db.autoReplyLog.count({
      where: {
        orgId,
        sentAt: { gte: cutoff },
        status: "SENT",
        rule: { brandId },
      },
    }),
    db.autoReplyLog.count({
      where: {
        orgId,
        sentAt: { gte: cutoff },
        status: "FAILED",
        rule: { brandId },
      },
    }),
    db.autoReplyLog.aggregate({
      _avg: { latencyMs: true },
      where: {
        orgId,
        sentAt: { gte: cutoff },
        status: "SENT",
        latencyMs: { not: null },
        rule: { brandId },
      },
    }),
  ]);

  const attempts = sentCount + failedCount;
  const successRate = attempts > 0 ? sentCount / attempts : null;
  const avgResponseMs = latencyAgg._avg.latencyMs;

  return NextResponse.json({
    success: true,
    data: {
      repliesSent: sentCount,
      successRate,
      avgResponseMs,
      activeRules,
      windowDays,
    },
  });
});
