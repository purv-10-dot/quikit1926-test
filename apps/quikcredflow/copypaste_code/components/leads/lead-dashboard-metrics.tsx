"use client";

import {
  Briefcase,
  CheckSquare,
  FileText,
  History,
  Phone,
  StickyNote,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { TabKey } from "@/components/leads/lead-detail-tabs";

interface Props {
  snapshot: LeadDashboardSnapshot;
  onNavigateTab: (tab: TabKey) => void;
}

export function LeadDashboardMetrics({ snapshot, onNavigateTab }: Props) {
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
      sub: `${snapshot.completedTasks} completed`,
      icon: CheckSquare,
      tone: "emerald",
      tab: "tasks",
    },
    {
      title: "Activities",
      value: String(snapshot.activitiesCount),
      icon: History,
      tone: "blue",
      tab: "timeline",
    },
    {
      title: "Calls",
      value: String(snapshot.callsCount),
      icon: Phone,
      tone: "sky",
      tab: "calls",
    },
    {
      title: "Opportunities",
      value: String(snapshot.opportunitiesCount),
      icon: Briefcase,
      tone: "violet",
      tab: "opportunities",
    },
    {
      title: "Notes",
      value: String(snapshot.notesCount),
      icon: StickyNote,
      tone: "amber",
      tab: "notes",
    },
    {
      title: "Documents",
      value: String(snapshot.documentsCount),
      icon: FileText,
      tone: "rose",
      tab: "documents",
    },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <button
          key={c.tab}
          type="button"
          onClick={() => onNavigateTab(c.tab)}
          className="text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded-lg"
        >
          <KpiCard
            title={c.title}
            value={c.value}
            sub={c.sub}
            icon={c.icon}
            tone={c.tone}
          />
        </button>
      ))}
    </div>
  );
}
