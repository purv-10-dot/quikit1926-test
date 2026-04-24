import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { creditNoteSchema } from "@/lib/schemas/finance";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
  const list = await db.cnCreditNote.findMany({
    where: { tenantId, deletedAt: null, ...(customerId ? { customerId } : {}) },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: { noteDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/finance/credit-notes
 *
 * Issues a credit against a customer. If `invoiceId` provided, we atomically
 * apply it to that invoice's `paidAmount` (increases it by note.amount,
 * capped at total) and set note.status="applied". Otherwise the note stays
 * "issued" for manual allocation later.
 */
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = creditNoteSchema.parse(await req.json());
  const dup = await db.cnCreditNote.findFirst({ where: { tenantId, noteNumber: input.noteNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Credit note '${input.noteNumber}' already exists` }, { status: 409 });

  const customer = await db.cnCustomer.findFirst({ where: { id: input.customerId, tenantId }, select: { id: true } });
  if (!customer) return NextResponse.json({ success: false, error: "Customer not found" }, { status: 400 });

  let invoiceId: string | null = null;
  if (input.invoiceId) {
    const inv = await db.cnClientInvoice.findFirst({
      where: { id: input.invoiceId, tenantId, customerId: input.customerId, deletedAt: null },
      select: { id: true, total: true, paidAmount: true, status: true },
    });
    if (!inv) return NextResponse.json({ success: false, error: "Invoice not found or customer mismatch" }, { status: 400 });
    if (inv.status === "cancelled") return NextResponse.json({ success: false, error: "Invoice is cancelled" }, { status: 400 });
    const remaining = Number(inv.total) - Number(inv.paidAmount);
    if (input.amount > remaining + 0.01) return NextResponse.json({ success: false, error: `Amount exceeds outstanding ${remaining}` }, { status: 400 });
    invoiceId = inv.id;
  }

  const result = await db.$transaction(async (tx) => {
    const note = await tx.cnCreditNote.create({
      data: {
        tenantId,
        noteNumber: input.noteNumber,
        customerId: input.customerId,
        invoiceId,
        noteDate: new Date(input.noteDate),
        amount: input.amount,
        reason: input.reason,
        status: invoiceId ? "applied" : "issued",
        remarks: input.remarks ?? null,
        createdBy: userId,
      },
    });
    if (invoiceId) {
      const inv = await tx.cnClientInvoice.findUnique({ where: { id: invoiceId }, select: { total: true, paidAmount: true } });
      const newPaid = Number(inv!.paidAmount) + input.amount;
      const total = Number(inv!.total);
      const status = newPaid >= total - 0.01 ? "paid" : "partial";
      await tx.cnClientInvoice.update({ where: { id: invoiceId }, data: { paidAmount: newPaid, status } });
    }
    await logAudit({ tenantId, userId, actionType: "create", entityType: "cnCreditNote", entityId: note.id, entityRef: note.noteNumber, newValues: note, tx });
    return note;
  });

  return NextResponse.json({ success: true, data: result }, { status: 201 });
});
