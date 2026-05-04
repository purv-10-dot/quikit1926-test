import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { checkApprovalGate } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("purchase");

/**
 * POST /api/purchase/requisitions/[id]/submit
 *
 * draft → submitted. Applies approval gate (Phase 8) — if a CnApprovalRule
 * matches for docType="pr" above threshold, an approved CnApprovalRequest
 * must exist for this PR.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const pr = await db.cnPurchaseRequisition.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true, lines: { select: { quantity: true, estimatedRate: true } } },
  });
  if (!pr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (pr.status !== "draft") {
    return NextResponse.json({ success: false, error: `Cannot submit from status '${pr.status}'` }, { status: 400 });
  }

  const amount = pr.lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.estimatedRate ?? 0), 0);
  const gate = await checkApprovalGate({ orgId, docType: "pr", docId: pr.id, amount });
  if (!gate.allowed) return NextResponse.json({ success: false, error: gate.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });

  const updated = await db.cnPurchaseRequisition.update({
    where: { id: params.id },
    data: { status: "submitted", updatedBy: userId },
  });
  await logAudit({ orgId, userId, actionType: "status_change", entityType: "cnPurchaseRequisition", entityId: pr.id, oldValues: { status: "draft" }, newValues: { status: "submitted" } });
  return NextResponse.json({ success: true, data: updated });
});
