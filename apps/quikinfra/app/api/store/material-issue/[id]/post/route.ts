import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { logAudit } from "@/lib/audit";
import { postMaterialIssueOutward, StockError } from "@/lib/stock/ledger-service";
import type { TenantContext } from "@/lib/auth/context";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * POST /api/store/material-issue/[id]/post
 *
 * DRAFT → POSTED. Deducts stock by routing every line through the stock
 * ledger service (`postMaterialIssueOutward`), which — inside one
 * transaction — appends the CnStockLedger rows AND keeps the CnStockBalance
 * cache (quantity + moving-average rate) in sync. The negative-balance guard
 * lives in the service, so the ledger and the balance cache can never
 * disagree. This route must never write CnStockLedger / CnStockBalance
 * directly.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const issue = await db.cnMaterialIssue.findFirst({
    where: { id: params.id, orgId },
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
  if (!issue.locationId) {
    return NextResponse.json({ success: false, error: "Issue has no location; cannot post" }, { status: 400 });
  }
  const locationId = issue.locationId;
  const postedAt = new Date();

  // The stock service takes a TenantContext but only reads orgId/userId.
  const ctx = { orgId, userId } as TenantContext;

  try {
    await db.$transaction(async (tx) => {
      // Appends ledger rows + upserts the balance cache atomically. Throws
      // StockError (INSUFFICIENT_STOCK) if any line would drive a balance
      // negative — that rolls back the whole posting and the status flip.
      await postMaterialIssueOutward(tx, ctx, {
        id: issue.id,
        issueNumber: issue.issueNumber,
        projectId: issue.projectId,
        locationId,
        lines: issue.lines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          issuedQty: Number(l.issuedQty),
          unitRate: Number(l.unitRate),
        })),
      });
      await tx.cnMaterialIssue.update({
        where: { id: issue.id },
        data: { status: "posted", updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    if (err instanceof StockError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }

  await logAudit({ orgId, userId, actionType: "post", entityType: "cnMaterialIssue", entityId: issue.id, entityRef: issue.issueNumber, oldValues: { status: "draft" }, newValues: { status: "posted" } });
  return NextResponse.json({ success: true, data: { id: issue.id, status: "posted", postedAt } });
}, { permission: { resource: "construction.issue", action: "approve" } });
