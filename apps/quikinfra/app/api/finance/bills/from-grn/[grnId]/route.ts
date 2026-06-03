import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { billFromGrnSchema } from "@/lib/schemas/finance";

const withOrgAuth = withOrgAuthForModule("finance");

/**
 * POST /api/finance/bills/from-grn/[grnId] — materialize a posted GRN into a
 * vendor bill. Totals copied from GRN lines. GRN must be status=posted and
 * not already billed (enforced by CnVendorBill.grnId @@unique).
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req, ctx: { params: { grnId: string } }) => {
  const input = billFromGrnSchema.parse(await req.json());

  const grn = await db.cnGoodsReceiptNote.findFirst({
    where: { id: ctx.params.grnId, orgId, deletedAt: null },
    include: { lines: { select: { acceptedQty: true, unitRate: true, amount: true } }, bill: { select: { id: true } } },
  });
  if (!grn) return NextResponse.json({ success: false, error: "GRN not found" }, { status: 404 });
  if (grn.status !== "posted") return NextResponse.json({ success: false, error: "GRN must be posted before billing" }, { status: 400 });
  if (grn.bill) return NextResponse.json({ success: false, error: "GRN already billed" }, { status: 409 });

  const dup = await db.cnVendorBill.findFirst({ where: { orgId, billNumber: input.billNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Bill '${input.billNumber}' already exists` }, { status: 409 });

  // Sum accepted × rate from GRN lines (taxAmount = 0 in this MVP; extend to pull GST from PO lines later)
  const subtotal = grn.lines.reduce((s, l) => s + Number(l.amount), 0);
  const taxAmount = 0;
  const total = subtotal + taxAmount;

  const bill = await db.cnVendorBill.create({
    data: {
      orgId,
      billNumber: input.billNumber,
      vendorId: grn.vendorId,
      projectId: grn.projectId,
      grnId: grn.id,
      poId: grn.poId,
      supplierInvoiceNo: input.supplierInvoiceNo ?? grn.supplierInvoiceNo ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : grn.supplierInvoiceDate,
      billDate: new Date(input.billDate),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      subtotal,
      taxAmount,
      total,
      paidAmount: 0,
      status: "approved",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: bill }, { status: 201 });
}, { permission: { resource: "construction.finance", action: "create" } });
