"use client";

import { memo } from "react";
import {
  Briefcase,
  CheckSquare,
  DollarSign,
  History,
  Mail,
  Phone,
  StickyNote,
  Calendar,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { TabKey } from "@/components/leads/lead-detail-tabs";
import { KpiCardSkeleton } from "@/components/leads/dashboard/skeleton";

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 64;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="text-accent-500 opacity-80" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function TrendPill({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-crm-muted">— vs last week</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-xs font-medium " +
        (up ? "text-emerald-600" : "text-rose-600")
      }
    >
      <Icon size={12} />
      {up ? "+" : ""}
      {pct}% vs last week
    </span>
  );
}

interface KpiDef {
  title: string;
  value: string;
  trend?: number;
  spark: number[];
  icon: typeof Phone;
  tone: "blue" | "emerald" | "violet" | "amber" | "sky" | "rose";
  tab: TabKey;
}

export const AdvancedKpiSection = memo(function AdvancedKpiSection({
  snapshot,
  loading,
  onNavigateTab,
}: {
  snapshot: LeadDashboardSnapshot;
  loading?: boolean;
  onNavigateTab: (tab: TabKey) => void;
}) {
  const spark = (n: number) =>
    Array.from({ length: 7 }, (_, i) => Math.max(0, n - 3 + i + (i % 2)));

  const cards: KpiDef[] = [
    {
      title: "Calls",
      value: String(snapshot.callsCount),
      trend: snapshot.trends.calls,
      spark: spark(snapshot.callsCount),
      icon: Phone,
      tone: "sky",
      tab: "calls",
    },
    {
      title: "Tasks",
      value: String(snapshot.openTasks),
      trend: snapshot.trends.tasks,
      spark: spark(snapshot.openTasks),
      icon: CheckSquare,
      tone: "emerald",
      tab: "tasks",
    },
    {
      title: "Meetings",
      value: String(snapshot.meetingsCount),
      spark: spark(snapshot.meetingsCount),
      icon: Calendar,
      tone: "violet",
      tab: "timeline",
    },
    {
      title: "Emails",
      value: String(snapshot.emailsCount),
      trend: snapshot.trends.emails,
      spark: spark(snapshot.emailsCount),
      icon: Mail,
      tone: "blue",
      tab: "communications",
    },
    {
      title: "Notes",
      value: String(snapshot.notesCount),
      spark: spark(snapshot.notesCount),
      icon: StickyNote,
      tone: "amber",
      tab: "notes",
    },
    {
      title: "Revenue",
      value:
        snapshot.revenueTotal >= 1000
          ? `₹${(snapshot.revenueTotal / 1000).toFixed(1)}k`
          : `₹${snapshot.revenueTotal}`,
      spark: spark(Math.round(snapshot.revenueTotal / 1000)),
      icon: DollarSign,
      tone: "rose",
      tab: "opportunities",
    },
  ];

  if (loading) {
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const TONE_TEXT: Record<string, string> = {
    blue: "text-crm-blue",
    emerald: "text-emerald-600",
    violet: "text-violet-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => onNavigateTab(c.tab)}
            className="crm-card group p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-crm-muted">{c.title}</p>
                <p className="mt-1 text-2xl font-semibold text-crm-text">{c.value}</p>
                {c.trend !== undefined ? <TrendPill pct={c.trend} /> : null}
              </div>
              <Icon className={`h-7 w-7 shrink-0 ${TONE_TEXT[c.tone]}`} strokeWidth={1.5} />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <Sparkline values={c.spark} />
              <History
                size={14}
                className="text-crm-muted opacity-0 transition group-hover:opacity-100"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
});
