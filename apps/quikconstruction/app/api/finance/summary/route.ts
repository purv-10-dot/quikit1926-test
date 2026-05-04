import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("finance");

/**
 * GET /api/finance/summary — AR + AP snapshot.
 *
 * AR (Accounts Receivable) = outstanding on non-cancelled invoices (total - paidAmount)
 * AP (Accounts Payable)    = outstanding on non-cancelled bills (total - paidAmount)
 * Also returns overdue sub-totals (dueDate < today, status ≠ paid/cancelled).
 */
export const GET = withTenantAuth(async ({ orgId }) => {
  const today = new Date();

  const [invoices, bills] = await Promise.all([
    db.cnClientInvoice.findMany({
      where: { orgId, deletedAt: null, status: { not: "cancelled" } },
      select: { total: true, paidAmount: true, dueDate: true, status: true },
    }),
    db.cnVendorBill.findMany({
      where: { orgId, deletedAt: null, status: { not: "cancelled" } },
      select: { total: true, paidAmount: true, dueDate: true, status: true },
    }),
  ]);

  const arTotal = invoices.reduce((s, i) => s + (Number(i.total) - Number(i.paidAmount)), 0);
  const arOverdue = invoices.reduce(
    (s, i) =>
      i.dueDate && i.dueDate < today && i.status !== "paid"
        ? s + (Number(i.total) - Number(i.paidAmount))
        : s,
    0,
  );
  const apTotal = bills.reduce((s, b) => s + (Number(b.total) - Number(b.paidAmount)), 0);
  const apOverdue = bills.reduce(
    (s, b) =>
      b.dueDate && b.dueDate < today && b.status !== "paid"
        ? s + (Number(b.total) - Number(b.paidAmount))
        : s,
    0,
  );

  const [invoiceCount, billCount, receiptCount, paymentCount] = await Promise.all([
    db.cnClientInvoice.count({ where: { orgId, deletedAt: null } }),
    db.cnVendorBill.count({ where: { orgId, deletedAt: null } }),
    db.cnClientReceipt.count({ where: { orgId, deletedAt: null } }),
    db.cnVendorPayment.count({ where: { orgId, deletedAt: null } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      ar: { total: arTotal, overdue: arOverdue, invoiceCount, receiptCount },
      ap: { total: apTotal, overdue: apOverdue, billCount, paymentCount },
    },
  });
});
