import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/projects/[projectId]/rab/summary
 *
 * Per-project RA bill summary: counts by status and money rollups. Only
 * approved bills contribute to `billedToDate` (the running cumulative
 * value), matching the billing-ledger invariant — drafts/submitted bills
 * are proposals and don't count as billed.
 */
export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  // Per-user project scope guard.
  if (ctx.projectIds !== undefined && !ctx.projectIds.includes(params.projectId)) {
    return NextResponse.json({ error: "Project not accessible" }, { status: 403 });
  }

  const where = { orgId: ctx.orgId, projectId: params.projectId };

  const [byStatus, approvedAgg, allAgg] = await Promise.all([
    db.cnRunningAccountBill.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    db.cnRunningAccountBill.aggregate({
      where: { ...where, status: "approved" },
      _sum: { currentBillAmount: true, netPayable: true, retentionAmount: true },
      _count: { _all: true },
    }),
    db.cnRunningAccountBill.aggregate({
      where,
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) {
    statusCounts[r.status ?? "unknown"] = r._count?._all ?? 0;
  }

  const numOr = (v: unknown) => Number((v as { toString?: () => string })?.toString?.() ?? "0");

  return NextResponse.json({
    data: {
      projectId: params.projectId,
      totalBills: allAgg._count?._all ?? 0,
      statusCounts,
      approvedBills: approvedAgg._count?._all ?? 0,
      billedToDate: numOr(approvedAgg._sum?.currentBillAmount).toFixed(2),
      netPaidToDate: numOr(approvedAgg._sum?.netPayable).toFixed(2),
      retentionHeld: numOr(approvedAgg._sum?.retentionAmount).toFixed(2),
    },
  });
}
