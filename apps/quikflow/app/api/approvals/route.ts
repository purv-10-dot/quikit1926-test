import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { ApprovalDTO } from "@/types";

/**
 * GET /api/approvals?status=pending — the approvals inbox: runs paused waiting
 * on a person. Defaults to pending.
 */
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "approved" || statusParam === "rejected" ? statusParam : "pending";

  const rows = await db.wfApproval.findMany({
    where: { orgId, status },
    include: { workflow: { select: { name: true, app: true } } },
    orderBy: { createdAt: "desc" },
  });

  const data: ApprovalDTO[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    status: r.status,
    workflowName: r.workflow.name,
    app: r.workflow.app,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
});
