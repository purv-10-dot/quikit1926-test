import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { checkApprovalGate } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("purchase");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const po = await db.cnPurchaseOrder.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true, totalAmount: true },
  });
  if (!po) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (po.status !== "draft") {
    return NextResponse.json({ success: false, error: `Cannot send from status '${po.status}'` }, { status: 400 });
  }

  const gate = await checkApprovalGate({ orgId, docType: "po", docId: po.id, amount: Number(po.totalAmount) });
  if (!gate.allowed) return NextResponse.json({ success: false, error: gate.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });

  const updated = await db.cnPurchaseOrder.update({
    where: { id: params.id },
    data: { status: "sent", updatedBy: userId },
  });
  await logAudit({ orgId, userId, actionType: "status_change", entityType: "cnPurchaseOrder", entityId: po.id, oldValues: { status: "draft" }, newValues: { status: "sent" } });
  return NextResponse.json({ success: true, data: updated });
});
