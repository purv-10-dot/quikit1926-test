import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { checkApprovalGate } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";
import { canFinalize, forbidden } from "@/lib/permissions";

const withOrgAuth = withOrgAuthForModule("hrms");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId, session }, _req, { params }) => {
  if (!canFinalize(session.user.membershipRole)) return forbidden("Payroll finalize requires admin or accountant role");
  const p = await db.cnPayroll.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true, totalNet: true } });
  if (!p) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (p.status !== "draft") return NextResponse.json({ success: false, error: `Cannot finalize from '${p.status}'` }, { status: 400 });

  const gate = await checkApprovalGate({ orgId, docType: "payroll", docId: p.id, amount: Number(p.totalNet) });
  if (!gate.allowed) return NextResponse.json({ success: false, error: gate.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });

  const updated = await db.cnPayroll.update({
    where: { id: p.id },
    data: { status: "finalized", finalizedAt: new Date(), finalizedBy: userId, updatedBy: userId },
  });
  await logAudit({ orgId, userId, actionType: "finalize", entityType: "cnPayroll", entityId: p.id, oldValues: { status: "draft" }, newValues: { status: "finalized" } });
  return NextResponse.json({ success: true, data: updated });
});
