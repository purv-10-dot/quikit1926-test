"use client";

import { Briefcase, CheckSquare, FileText, History, CircleDollarSign, Phone } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatGeneric } from "@/lib/services/opportunities/currency";
import type { ContactDashboardSnapshot } from "@/lib/services/contacts/dashboard-snapshot";
import type { TabKey } from "@/components/contacts/contact-detail-tabs";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface Props {
  snapshot: ContactDashboardSnapshot;
  currency?: string;
  hasAccount: boolean;
  onNavigateTab: (tab: TabKey) => void;
}

export function ContactDashboardMetrics({
  snapshot,
  currency = "INR",
  hasAccount,
  onNavigateTab,
}: Props) {
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
      title: "Open tasks",
      value: String(snapshot.openTasks),
      sub: `${snapshot.completedTasks} done`,
      icon: CheckSquare,
      tone: "sky",
      tab: "tasks",
    },
    {
      title: "Last touch",
      value: lastTouch,
      sub: `${snapshot.activitiesCount} activities`,
      icon: History,
      tone: snapshot.isStaleTouch ? "rose" : "blue",
      tab: "timeline",
    },
    {
      title: "Notes",
      value: String(snapshot.notesCount),
      icon: FileText,
      tone: "emerald",
      tab: "notes",
    },
    {
      title: "Calls",
      value: String(snapshot.callsCount),
      icon: Phone,
      tone: "amber",
      tab: "timeline",
    },
  ];

  if (hasAccount) {
    cards.splice(1, 0, {
      title: "Open pipeline",
      value:
        snapshot.openPipeline > 0 ? formatGeneric(snapshot.openPipeline, currency) : "—",
      sub: `${snapshot.opportunitiesCount} opps`,
      icon: CircleDollarSign,
      tone: "violet",
      tab: "opportunities",
    });
  }

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
