import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { checkApprovalGate } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";
import { canApprove, forbidden } from "@/lib/permissions";

const withTenantAuth = withTenantAuthForModule("projects");

export const POST = withTenantAuth<{ id: string }>(async ({ orgId, userId, session }, _req, { params }) => {
  if (!canApprove(session.user.membershipRole)) return forbidden("RAB approval requires admin or project manager role");
  const rab = await db.cnRAB.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true, total: true } });
  if (!rab) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rab.status === "approved" || rab.status === "paid") {
    return NextResponse.json({ success: false, error: `Already ${rab.status}` }, { status: 409 });
  }
  if (rab.status === "rejected") {
    return NextResponse.json({ success: false, error: "Cannot approve a rejected RAB" }, { status: 400 });
  }

  // Approval gate
  const gate = await checkApprovalGate({ orgId, docType: "rab", docId: rab.id, amount: Number(rab.total) });
  if (!gate.allowed) return NextResponse.json({ success: false, error: gate.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });

  const updated = await db.cnRAB.update({
    where: { id: rab.id },
    data: { status: "approved", approvedAt: new Date(), approvedBy: userId, updatedBy: userId },
  });
  await logAudit({ orgId, userId, actionType: "approve", entityType: "cnRAB", entityId: rab.id, oldValues: { status: rab.status }, newValues: { status: "approved" } });
  return NextResponse.json({ success: true, data: updated });
});
