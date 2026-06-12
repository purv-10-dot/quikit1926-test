"use client";

import {
  Briefcase,
  CheckSquare,
  FileText,
  History,
  CircleDollarSign,
  Users,
  UserPlus,
  Receipt,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatGeneric } from "@/lib/services/opportunities/currency";
import type { AccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";
import type { TabKey } from "@/components/accounts/account-detail-tabs";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface Props {
  snapshot: AccountDashboardSnapshot;
  currency?: string;
  onNavigateTab: (tab: TabKey) => void;
}

function formatMoney(amount: number, currency: string): string {
  if (amount <= 0) return "—";
  return formatGeneric(amount, currency);
}

export function AccountDashboardMetrics({ snapshot, currency = "INR", onNavigateTab }: Props) {
  const lastTouch = snapshot.lastTouchAt
    ? formatDateTime(snapshot.lastTouchAt)
    : "No touch yet";

  const cards: {
    title: string;
    value: string;
    sub?: string;
    icon: typeof History;
    tone: "blue" | "emerald" | "violet" | "amber" | "sky" | "rose";
    tab: TabKey;
  }[] = [
    {
      title: "Open pipeline",
      value: formatMoney(snapshot.openPipeline, currency),
      icon: CircleDollarSign,
      tone: "violet",
      tab: "opportunities",
    },
    {
      title: "Won (12 mo)",
      value: formatMoney(snapshot.wonRevenue12mo, currency),
      icon: Briefcase,
      tone: "emerald",
      tab: "opportunities",
    },
    {
      title: "Open tasks",
      value: String(snapshot.openTasks),
      sub: `${snapshot.completedTasks} done`,
      icon: CheckSquare,
      tone: "sky",
      tab: "tasks",
    },
    {
      title: "Contacts",
      value: String(snapshot.contactsCount),
      icon: Users,
      tone: "blue",
      tab: "contacts",
    },
    {
      title: "Leads",
      value: String(snapshot.leadsCount),
      icon: UserPlus,
      tone: "amber",
      tab: "leads",
    },
    {
      title: "Last touch",
      value: lastTouch,
      sub: `${snapshot.activitiesCount} activities`,
      icon: History,
      tone: "rose",
      tab: "timeline",
    },
    {
      title: "Active quotes",
      value: String(snapshot.activeQuotesCount),
      icon: Receipt,
      tone: "violet",
      tab: "quotes",
    },
    {
      title: "Documents",
      value: String(snapshot.documentsCount),
      icon: FileText,
      tone: "emerald",
      tab: "documents",
    },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      {cards.map((c) => (
        <button
          key={c.tab + c.title}
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
