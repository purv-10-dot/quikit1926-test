import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { debitNoteSchema } from "@/lib/schemas/finance";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const vendorId = req.nextUrl.searchParams.get("vendorId") || undefined;
  const list = await db.cnDebitNote.findMany({
    where: { orgId, deletedAt: null, ...(vendorId ? { vendorId } : {}) },
    include: {
      vendor: { select: { id: true, name: true, code: true } },
      bill: { select: { id: true, billNumber: true } },
    },
    orderBy: { noteDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/finance/debit-notes — reduces a vendor bill's outstanding. Same
 * pattern as credit-note but against CnVendorBill.
 */
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const input = debitNoteSchema.parse(await req.json());
  const dup = await db.cnDebitNote.findFirst({ where: { orgId, noteNumber: input.noteNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Debit note '${input.noteNumber}' already exists` }, { status: 409 });

  const vendor = await db.cnVendor.findFirst({ where: { id: input.vendorId, orgId }, select: { id: true } });
  if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 400 });

  let billId: string | null = null;
  if (input.billId) {
    const b = await db.cnVendorBill.findFirst({
      where: { id: input.billId, orgId, vendorId: input.vendorId, deletedAt: null },
      select: { id: true, total: true, paidAmount: true, status: true },
    });
    if (!b) return NextResponse.json({ success: false, error: "Bill not found or vendor mismatch" }, { status: 400 });
    if (b.status === "cancelled") return NextResponse.json({ success: false, error: "Bill is cancelled" }, { status: 400 });
    const remaining = Number(b.total) - Number(b.paidAmount);
    if (input.amount > remaining + 0.01) return NextResponse.json({ success: false, error: `Amount exceeds outstanding ${remaining}` }, { status: 400 });
    billId = b.id;
  }

  const result = await db.$transaction(async (tx) => {
    const note = await tx.cnDebitNote.create({
      data: {
        orgId, noteNumber: input.noteNumber,
        vendorId: input.vendorId, billId,
        noteDate: new Date(input.noteDate),
        amount: input.amount, reason: input.reason,
        status: billId ? "applied" : "issued",
        remarks: input.remarks ?? null,
        createdBy: userId,
      },
    });
    if (billId) {
      const b = await tx.cnVendorBill.findUnique({ where: { id: billId }, select: { total: true, paidAmount: true } });
      const newPaid = Number(b!.paidAmount) + input.amount;
      const total = Number(b!.total);
      const status = newPaid >= total - 0.01 ? "paid" : "partial";
      await tx.cnVendorBill.update({ where: { id: billId }, data: { paidAmount: newPaid, status } });
    }
    await logAudit({ orgId, userId, actionType: "create", entityType: "cnDebitNote", entityId: note.id, entityRef: note.noteNumber, newValues: note, tx });
    return note;
  });
  return NextResponse.json({ success: true, data: result }, { status: 201 });
});
