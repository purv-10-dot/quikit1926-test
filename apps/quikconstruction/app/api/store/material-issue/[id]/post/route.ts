import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { logAudit } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * POST /api/store/material-issue/[id]/post
 *
 * DRAFT → POSTED. Writes negative stock (qtyOut) rows to CnStockLedger in a
 * single transaction. Validates running balance per item+location before
 * issuing to prevent negative stock.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const issue = await db.cnMaterialIssue.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { lines: true },
  });
  if (!issue) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (issue.status === "posted") {
    return NextResponse.json({ success: false, error: "Issue is already posted" }, { status: 409 });
  }
  if (issue.status !== "draft") {
    return NextResponse.json(
      { success: false, error: `Cannot post from status '${issue.status}'` },
      { status: 400 },
    );
  }

  // Pre-check: current balance per item at this location (projectId + locationId + itemId)
  const insufficient: Array<{ itemId: string; available: number; requested: number }> = [];
  for (const line of issue.lines) {
    const agg = await db.cnStockLedger.aggregate({
      where: {
        orgId,
        projectId: issue.projectId,
        locationId: issue.locationId,
        itemId: line.itemId,
      },
      _sum: { qtyIn: true, qtyOut: true },
    });
    const available = Number(agg._sum.qtyIn ?? 0) - Number(agg._sum.qtyOut ?? 0);
    if (available < Number(line.issuedQty)) {
      insufficient.push({ itemId: line.itemId, available, requested: Number(line.issuedQty) });
    }
  }
  if (insufficient.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Insufficient stock",
        details: insufficient,
      },
      { status: 400 },
    );
  }

  const postedAt = new Date();

  try {
    await db.$transaction(async (tx) => {
      for (const line of issue.lines) {
        await tx.cnStockLedger.create({
          data: {
            orgId,
            projectId: issue.projectId,
            locationId: issue.locationId,
            itemId: line.itemId,
            transactionType: "issue",
            transactionRefId: issue.id,
            transactionRefNumber: issue.issueNumber,
            transactionDate: issue.issueDate,
            qtyIn: 0,
            qtyOut: line.issuedQty,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnMaterialIssue.update({
        where: { id: issue.id },
        data: { status: "posted", postedAt, postedBy: userId, updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }

  await logAudit({ orgId, userId, actionType: "post", entityType: "cnMaterialIssue", entityId: issue.id, entityRef: issue.issueNumber, oldValues: { status: "draft" }, newValues: { status: "posted" } });
  return NextResponse.json({ success: true, data: { id: issue.id, status: "posted", postedAt } });
});
