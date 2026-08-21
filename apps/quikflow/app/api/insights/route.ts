import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { InsightsData } from "@/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * GET /api/insights — runs-per-day (7d), success rate, and most-active
 * workflows. Scoped to the org and the caller's visible workflows.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const visibleWf = { OR: [{ scope: "org" as const }, { scope: "personal" as const, ownerId: userId }] };
  const runVisible = { orgId, workflow: visibleWf };

  const [recentRuns, grouped, workflows] = await Promise.all([
    db.wfRun.findMany({
      where: { ...runVisible, startedAt: { gte: sevenDaysAgo } },
      select: { status: true, startedAt: true },
    }),
    db.wfRun.groupBy({
      by: ["workflowId"],
      where: runVisible,
      _count: { workflowId: true },
      orderBy: { _count: { workflowId: "desc" } },
      take: 5,
    }),
    db.wfWorkflow.findMany({
      where: { orgId, deletedAt: null, ...visibleWf },
      select: { id: true, name: true, app: true },
    }),
  ]);

  // Runs per day for the last 7 calendar days.
  const buckets = new Map<string, { day: string; count: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { day: DAY_LABELS[d.getDay()], count: 0 });
  }
  for (const r of recentRuns) {
    const key = r.startedAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) b.count += 1;
  }

  const succeeded = recentRuns.filter((r) => r.status === "success").length;
  const failed = recentRuns.filter((r) => r.status === "failed").length;
  const total = succeeded + failed;
  const rate = total > 0 ? Math.round((succeeded / total) * 1000) / 10 : null;

  const wfMap = new Map(workflows.map((w) => [w.id, w]));
  const mostActive = grouped.map((g) => {
    const wf = wfMap.get(g.workflowId);
    return {
      workflowId: g.workflowId,
      workflowName: wf?.name ?? "Unknown",
      app: wf?.app ?? "",
      runs: g._count.workflowId,
    };
  });

  const data: InsightsData = {
    runsPerDay: Array.from(buckets.values()),
    successRate: { rate, succeeded, failed },
    mostActive,
  };

  return NextResponse.json({ success: true, data });
});
