"use client";

import { CircleDollarSign, FileText, History, ListOrdered, Truck } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatGeneric } from "@/lib/services/opportunities/currency";
import type { OrderDashboardSnapshot } from "@/lib/services/orders/dashboard-snapshot";
import type { TabKey } from "@/components/orders/order-detail-tabs";

interface Props {
  snapshot: OrderDashboardSnapshot;
  onNavigateTab: (tab: TabKey) => void;
}

export function OrderDashboardMetrics({ snapshot, onNavigateTab }: Props) {
  const deliveryLabel =
    snapshot.daysToDelivery == null
      ? "No ETA"
      : snapshot.daysToDelivery < 0
        ? `${Math.abs(snapshot.daysToDelivery)}d overdue`
        : snapshot.daysToDelivery === 0
          ? "Due today"
          : `${snapshot.daysToDelivery}d left`;

  const cards = [
    {
      title: "Grand total",
      value: formatGeneric(snapshot.grandTotal, snapshot.currency),
      sub: "Snapshotted at conversion",
      icon: CircleDollarSign,
      tone: "violet" as const,
      tab: "lines" as TabKey,
    },
    {
      title: "Line items",
      value: String(snapshot.lineCount),
      icon: ListOrdered,
      tone: "sky" as const,
      tab: "lines" as TabKey,
    },
    {
      title: "Activities",
      value: String(snapshot.activitiesCount),
      icon: History,
      tone: "blue" as const,
      tab: "timeline" as TabKey,
    },
    {
      title: "Delivery",
      value: deliveryLabel,
      sub: `${snapshot.daysSinceOrder}d since order`,
      icon: Truck,
      tone: (snapshot.isOverdueDelivery ? "rose" : "amber") as "rose" | "amber",
      tab: "overview" as TabKey,
    },
    {
      title: "Documents",
      value: String(snapshot.documentsCount),
      icon: FileText,
      tone: "emerald" as const,
      tab: "documents" as TabKey,
    },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <button
          key={c.title}
          type="button"
          onClick={() => onNavigateTab(c.tab)}
          className="rounded-lg text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <KpiCard title={c.title} value={c.value} sub={c.sub} icon={c.icon} tone={c.tone} />
        </button>
      ))}
    </div>
  );
}
