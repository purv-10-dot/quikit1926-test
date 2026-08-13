import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { RunDTO } from "@/types";

const STATUS_VALUES = ["running", "waiting", "success", "failed", "cancelled"] as const;

/**
 * GET /api/runs?status=success — run history for the org, newest first.
 * Scoped to workflows visible to the caller (org-wide + own personal).
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = STATUS_VALUES.find((s) => s === statusParam);

  const rows = await db.wfRun.findMany({
    where: {
      orgId,
      ...(status ? { status } : {}),
      workflow: { OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }] },
    },
    select: {
      id: true,
      workflowId: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      error: true,
      workflow: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const data: RunDTO[] = rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflow.name,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    error: r.error,
  }));

  return NextResponse.json({ success: true, data });
});
