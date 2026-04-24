import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { paymentCreateSchema } from "@/lib/schemas/finance";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const vendorId = req.nextUrl.searchParams.get("vendorId") || undefined;
  const list = await db.cnVendorPayment.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null, ...(vendorId ? { vendorId } : {}) },
    include: {
      vendor: { select: { id: true, name: true, code: true } },
      _count: { select: { allocations: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/finance/payments — record a vendor payment + allocations.
 * Same pattern as client receipts, but against CnVendorBill. Bills must be
 * status ∈ {approved, partial} to accept payment.
 */
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = paymentCreateSchema.parse(await req.json());

  const dup = await db.cnVendorPayment.findFirst({ where: { tenantId, paymentNumber: input.paymentNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Payment '${input.paymentNumber}' already exists` }, { status: 409 });

  const vendor = await db.cnVendor.findFirst({ where: { id: input.vendorId, tenantId }, select: { id: true } });
  if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 400 });

  const allocTotal = input.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocTotal > input.amount + 0.01) {
    return NextResponse.json({ success: false, error: "Allocations exceed payment amount" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    for (const a of input.allocations) {
      const bill = await tx.cnVendorBill.findFirst({
        where: { id: a.billId, tenantId, vendorId: input.vendorId, deletedAt: null },
        select: { id: true, total: true, paidAmount: true, status: true },
      });
      if (!bill) throw new Error(`Bill ${a.billId} not found or vendor mismatch`);
      if (!["approved", "partial"].includes(bill.status)) throw new Error(`Bill is ${bill.status}; must be approved before payment`);
      const remaining = Number(bill.total) - Number(bill.paidAmount);
      if (a.amount > remaining + 0.01) throw new Error(`Allocation ${a.amount} exceeds bill remaining ${remaining}`);
    }

    const payment = await tx.cnVendorPayment.create({
      data: {
        tenantId,
        paymentNumber: input.paymentNumber,
        vendorId: input.vendorId,
        paymentDate: new Date(input.paymentDate),
        amount: input.amount,
        allocatedAmount: allocTotal,
        mode: input.mode,
        reference: input.reference ?? null,
        remarks: input.remarks ?? null,
        createdBy: userId,
        allocations: { create: input.allocations.map((a) => ({ billId: a.billId, amount: a.amount })) },
      },
      include: { allocations: true },
    });

    for (const a of input.allocations) {
      const bill = await tx.cnVendorBill.findUnique({ where: { id: a.billId }, select: { total: true, paidAmount: true } });
      const newPaid = Number(bill!.paidAmount) + a.amount;
      const total = Number(bill!.total);
      const status = newPaid >= total - 0.01 ? "paid" : newPaid > 0 ? "partial" : "approved";
      await tx.cnVendorBill.update({ where: { id: a.billId }, data: { paidAmount: newPaid, status } });
    }

    return payment;
  });

  return NextResponse.json({ success: true, data: result }, { status: 201 });
});
