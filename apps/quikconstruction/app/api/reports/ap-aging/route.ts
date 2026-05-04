import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("reports");

export const GET = withTenantAuth(async ({ orgId }) => {
  const today = new Date();
  const bills = await db.cnVendorBill.findMany({
    where: { orgId, deletedAt: null, status: { not: "cancelled" } },
    select: { id: true, billNumber: true, vendorId: true, total: true, paidAmount: true, billDate: true, dueDate: true, status: true, vendor: { select: { name: true } } },
  });
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const rows = bills.map(b => {
    const outstanding = Number(b.total) - Number(b.paidAmount);
    if (outstanding <= 0.01) return null;
    const ref = b.dueDate ?? b.billDate;
    const daysOverdue = Math.floor((today.getTime() - ref.getTime()) / 86400000);
    let bucket: keyof typeof buckets;
    if (daysOverdue <= 0) bucket = "current";
    else if (daysOverdue <= 30) bucket = "d30";
    else if (daysOverdue <= 60) bucket = "d60";
    else if (daysOverdue <= 90) bucket = "d90";
    else bucket = "over90";
    buckets[bucket] += outstanding;
    return { billId: b.id, billNumber: b.billNumber, vendor: b.vendor?.name ?? "—", daysOverdue, bucket, outstanding };
  }).filter(Boolean);
  return NextResponse.json({ success: true, data: { buckets, rows } });
});
