import { requireUser } from "@/lib/auth/require";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { OrdersListClient, type OrdersStats } from "@/components/orders/orders-list-client";

/**
 * Server-side stats roll-up for the Orders list. Same pattern as
 * computeQuoteStats — single groupBy, no extra HTTP round-trip, stats
 * reflect ALL orders in the tenant (not filtered).
 */
async function computeOrderStats(orgId: string): Promise<OrdersStats> {
  const grouped = await db.qcfOrder.groupBy({
    by: ["status"],
    where: { orgId },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });

  const stats: OrdersStats = {
    total: 0,
    byStatus: { Open: 0, Confirmed: 0, Fulfilled: 0, Closed: 0, Cancelled: 0 },
    openGrandTotal: 0,
    fulfilledGrandTotal: 0,
  };
  for (const row of grouped) {
    const count = row._count._all;
    stats.total += count;
    stats.byStatus[row.status] = count;
    const sum = Number(String(row._sum.grandTotal ?? 0));
    if (row.status === "Open") stats.openGrandTotal = sum;
    if (row.status === "Fulfilled") stats.fulfilledGrandTotal = sum;
  }
  return stats;
}

export default async function OrdersPage() {
  const user = await requireUser();
  const stats = await computeOrderStats(user.orgId);
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Orders"
        subtitle="Confirmed sales handed off from Won quotes. Track delivery + close-out."
      />
      <OrdersListClient initialStats={stats} />
    </PageContainer>
  );
}
