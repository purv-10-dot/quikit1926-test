import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { DashboardSummary } from "@/types";

/**
 * GET /api/dashboard — summary cards + recent activity for the landing page.
 * All counts are scoped to the org and to workflows the caller can see.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const visibleWf = { OR: [{ scope: "org" as const }, { scope: "personal" as const, ownerId: userId }] };
  const runVisible = { orgId, workflow: visibleWf };

  const [activeWorkflows, newThisMonth, runsToday, last7, waiting, recent] = await Promise.all([
    db.wfWorkflow.count({ where: { orgId, status: "Active", ...visibleWf } }),
    db.wfWorkflow.count({ where: { orgId, createdAt: { gte: startOfMonth }, ...visibleWf } }),
    db.wfRun.count({ where: { ...runVisible, startedAt: { gte: startOfToday } } }),
    db.wfRun.findMany({
      where: { ...runVisible, startedAt: { gte: sevenDaysAgo }, status: { in: ["success", "failed"] } },
      select: { status: true },
    }),
    db.wfRun.count({ where: { ...runVisible, status: "waiting" } }),
    db.wfRun.findMany({
      where: runVisible,
      select: {
        id: true,
        status: true,
        error: true,
        startedAt: true,
        workflow: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  const succeeded = last7.filter((r) => r.status === "success").length;
  const failed = last7.filter((r) => r.status === "failed").length;
  const total = succeeded + failed;
  const successRate = total > 0 ? Math.round((succeeded / total) * 1000) / 10 : null;

  const data: DashboardSummary = {
    activeWorkflows,
    newThisMonth,
    runsToday,
    successRate,
    needsAttention: { total: failed + waiting, failed, waiting },
    recentActivity: recent.map((r) => ({
      id: r.id,
      workflowName: r.workflow.name,
      status: r.status,
      detail: r.error,
      at: r.startedAt.toISOString(),
    })),
  };

  return NextResponse.json({ success: true, data });
});
