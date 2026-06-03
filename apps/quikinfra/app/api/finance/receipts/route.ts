import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { receiptCreateSchema } from "@/lib/schemas/finance";

const withOrgAuth = withOrgAuthForModule("finance");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
  const list = await db.cnClientReceipt.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(customerId ? { customerId } : {}) },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      _count: { select: { allocations: true } },
    },
    orderBy: { receiptDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
}, { permission: { resource: "construction.finance", action: "view" } });

/**
 * POST /api/finance/receipts — record a client receipt + allocations.
 *
 * Transaction:
 *   1. Validate receipt # unique, customer exists
 *   2. Validate sum(allocations.amount) <= receipt.amount
 *   3. For each allocation: invoice belongs to same customer + tenant; remaining = total-paidAmount >= alloc amount
 *   4. Create receipt + allocations
 *   5. For each invoice: increment paidAmount, update status (partial/paid)
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = receiptCreateSchema.parse(await req.json());

  const dup = await db.cnClientReceipt.findFirst({ where: { orgId, receiptNumber: input.receiptNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Receipt '${input.receiptNumber}' already exists` }, { status: 409 });

  const customer = await db.cnCustomer.findFirst({ where: { id: input.customerId, orgId }, select: { id: true } });
  if (!customer) return NextResponse.json({ success: false, error: "Customer not found" }, { status: 400 });

  const allocTotal = input.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocTotal > input.amount + 0.01) {
    return NextResponse.json({ success: false, error: "Allocations exceed receipt amount" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    // Validate invoices
    for (const a of input.allocations) {
      const inv = await tx.cnClientInvoice.findFirst({
        where: { id: a.invoiceId, orgId, customerId: input.customerId, deletedAt: null },
        select: { id: true, total: true, paidAmount: true, status: true },
      });
      if (!inv) throw new Error(`Invoice ${a.invoiceId} not found or customer mismatch`);
      if (inv.status === "cancelled") throw new Error(`Invoice is cancelled`);
      const remaining = Number(inv.total) - Number(inv.paidAmount);
      if (a.amount > remaining + 0.01) throw new Error(`Allocation ${a.amount} exceeds invoice remaining ${remaining}`);
    }

    const receipt = await tx.cnClientReceipt.create({
      data: {
        orgId,
        receiptNumber: input.receiptNumber,
        customerId: input.customerId,
        receiptDate: new Date(input.receiptDate),
        amount: input.amount,
        allocatedAmount: allocTotal,
        mode: input.mode,
        reference: input.reference ?? null,
        remarks: input.remarks ?? null,
        createdBy: userId,
        allocations: { create: input.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
      },
      include: { allocations: true },
    });

    // Update invoice paidAmount + status
    for (const a of input.allocations) {
      const inv = await tx.cnClientInvoice.findUnique({ where: { id: a.invoiceId }, select: { total: true, paidAmount: true } });
      const newPaid = Number(inv!.paidAmount) + a.amount;
      const total = Number(inv!.total);
      const status = newPaid >= total - 0.01 ? "paid" : newPaid > 0 ? "partial" : "sent";
      await tx.cnClientInvoice.update({ where: { id: a.invoiceId }, data: { paidAmount: newPaid, status } });
    }

    return receipt;
  });

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}, { permission: { resource: "construction.finance", action: "create" } });
