import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("reports");

export const GET = withTenantAuth(async ({ tenantId }) => {
  const today = new Date();
  const invoices = await db.cnClientInvoice.findMany({
    where: { tenantId, deletedAt: null, status: { not: "cancelled" } },
    select: { id: true, invoiceNumber: true, customerId: true, total: true, paidAmount: true, invoiceDate: true, dueDate: true, status: true, customer: { select: { name: true } } },
  });
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const rows = invoices.map(i => {
    const outstanding = Number(i.total) - Number(i.paidAmount);
    if (outstanding <= 0.01) return null;
    const ref = i.dueDate ?? i.invoiceDate;
    const daysOverdue = Math.floor((today.getTime() - ref.getTime()) / 86400000);
    let bucket: keyof typeof buckets;
    if (daysOverdue <= 0) bucket = "current";
    else if (daysOverdue <= 30) bucket = "d30";
    else if (daysOverdue <= 60) bucket = "d60";
    else if (daysOverdue <= 90) bucket = "d90";
    else bucket = "over90";
    buckets[bucket] += outstanding;
    return { invoiceId: i.id, invoiceNumber: i.invoiceNumber, customer: i.customer?.name ?? "—", daysOverdue, bucket, outstanding };
  }).filter(Boolean);
  return NextResponse.json({ success: true, data: { buckets, rows } });
});
