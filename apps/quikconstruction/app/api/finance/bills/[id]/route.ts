import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { checkApprovalGate } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";
import { canApprove, forbidden } from "@/lib/permissions";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ orgId }, _req, ctx: { params: { id: string } }) => {
  const bill = await db.cnVendorBill.findFirst({
    where: { id: ctx.params.id, orgId },
    include: {
      vendor: true,
      project: { select: { id: true, name: true, code: true } },
      grn: { select: { id: true, grnNumber: true, grnDate: true } },
      po: { select: { id: true, poNumber: true } },
      allocations: { include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, mode: true } } } },
      lines: { orderBy: { sortOrder: "asc" }, include: { uom: { select: { code: true } } } },
      debitNotes: { where: { deletedAt: null }, select: { id: true, noteNumber: true, amount: true, noteDate: true, status: true } },
    },
  });
  if (!bill) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: bill });
});

export const PATCH = withTenantAuth(async ({ orgId, userId, session }, req, ctx: { params: { id: string } }) => {
  const body = await req.json();
  if (body.action === "approve" && !canApprove(session.user.membershipRole)) return forbidden("Bill approval requires admin or project manager role");
  const bill = await db.cnVendorBill.findFirst({ where: { id: ctx.params.id, orgId }, select: { id: true, status: true, total: true } });
  if (!bill) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (body.action === "approve") {
    if (bill.status !== "draft") return NextResponse.json({ success: false, error: "Only draft bills can be approved" }, { status: 400 });
    const gate = await checkApprovalGate({ orgId, docType: "vendor_bill", docId: bill.id, amount: Number(bill.total) });
    if (!gate.allowed) return NextResponse.json({ success: false, error: gate.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });
    const updated = await db.cnVendorBill.update({ where: { id: bill.id }, data: { status: "approved", updatedBy: userId } });
    await logAudit({ orgId, userId, actionType: "approve", entityType: "cnVendorBill", entityId: bill.id, oldValues: { status: "draft" }, newValues: { status: "approved" } });
    return NextResponse.json({ success: true, data: updated });
  }
  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
});
