"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Truck, Banknote, Receipt } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Kpi, SectionHeader, WidgetCard, EmptyState, QuickActions, Timeline } from "@/components/portal/widgets";

type Dash = {
  noContact?: boolean;
  kpis: { openPos: number; pendingDeliveries: number; billsSubmitted: number; outstanding: number; unpaidBills: number };
  recentPos: Array<{ id: string; purchase_order_number: string; total: string; status: string; issue_date: string | null }>;
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export function VendorDashboard() {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["vendor-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/vendor/dashboard");
      return r.ok ? ((await r.json()).data as Dash) : null;
    }
  });

  if (data?.noContact) return <EmptyState icon={Package} title="No vendor account linked" hint="Your login isn't linked to a supplier record yet." />;
  const k = data?.kpis;

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionHeader title="Supplier dashboard" description="Your purchase orders, deliveries and payments" actions={
        <QuickActions actions={[
          { label: "Submit bill", href: "/vendor/billing/bills", icon: Receipt },
          { label: "View POs", href: "/vendor/purchase/orders", icon: Package }
        ]} />
      } />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open purchase orders" value={k?.openPos ?? 0} icon={Package} tone="indigo" loading={isPending} />
        <Kpi label="Pending deliveries" value={k?.pendingDeliveries ?? 0} icon={Truck} tone="amber" loading={isPending} />
        <Kpi label="Bills submitted" value={k?.billsSubmitted ?? 0} icon={Receipt} loading={isPending} />
        <Kpi label="Outstanding" value={format(k?.outstanding ?? 0)} sub={`${k?.unpaidBills ?? 0} unpaid bills`} icon={Banknote} tone="emerald" loading={isPending} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="Recent purchase orders" href="/vendor/purchase/orders">
          {(data?.recentPos ?? []).length === 0 ? <EmptyState icon={Package} title="No purchase orders yet" /> : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {data!.recentPos.map((po) => (
                  <tr key={po.id} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5"><Link href="/vendor/purchase/orders" className="font-medium text-primary hover:underline">{po.purchase_order_number}</Link><p className="text-xs text-muted-foreground">{fmtDate(po.issue_date)}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(po.total))}</td>
                    <td className="px-5 py-2.5 text-right"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", po.status === "accepted" ? "bg-emerald-100 text-emerald-700" : po.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{po.status?.replace(/_/g, " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WidgetCard>
        <WidgetCard title="Announcements"><Timeline items={[{ title: "Vendor portal is live", meta: "Procurement", time: "Today", tone: "emerald" }, { title: "Submit bills directly against accepted POs", meta: "Finance", time: "This week" }]} /></WidgetCard>
      </div>
    </div>
  );
}
