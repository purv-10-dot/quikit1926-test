"use client";

import { memo } from "react";
import {
  Building2,
  CheckSquare,
  DollarSign,
  Phone,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { KpiCard } from "./kpi-card";
import { KpiCardSkeleton } from "./kpi-card-skeleton";
import { DeltaPill } from "./delta-pill";
import type { DashboardSummaryDto } from "@/lib/dashboard/types";

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 56;
  const h = 22;
  const pts = values
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="text-accent-500/90" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} />
    </svg>
  );
}

export const ExecutiveKpiGrid = memo(function ExecutiveKpiGrid({
  summary,
  loading,
  labelForPrior,
  rangeDescription,
  onNavigate,
}: {
  summary: DashboardSummaryDto | undefined;
  loading: boolean;
  labelForPrior: string;
  rangeDescription: string;
  onNavigate?: (path: string) => void;
}) {
  if (loading || !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const dom = summary.pipelineValueByCurrency[0];
  const pipelineValue = dom ? dom.display : summary.pipelineValueDisplay;
  const spark = (n: number) =>
    Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(n * (0.5 + (i + 1) / 14))));

  const cards = [
    {
      title: "New leads",
      value: String(summary.leadCount),
      sub:
        summary.conversionLeadToQualifiedPct !== null
          ? `${summary.conversionLeadToQualifiedPct}% qualified · ${rangeDescription}`
          : `No leads in ${rangeDescription}`,
      icon: Users,
      tone: "blue" as const,
      delta: <DeltaPill delta={summary.kpis.leadCount.delta} rangeLabel={labelForPrior} />,
      spark: spark(summary.leadCount),
      href: "/leads",
    },
    {
      title: "Won revenue",
      value: summary.executive.wonRevenueDisplay,
      sub: `${summary.executive.wonDealsCount} deals closed`,
      icon: Trophy,
      tone: "emerald" as const,
      delta: <DeltaPill delta={summary.kpis.wonDeals.delta} rangeLabel={labelForPrior} />,
      spark: spark(summary.executive.wonDealsCount),
      href: "/opportunities",
    },
    {
      title: "Open pipeline",
      value: pipelineValue,
      sub: `Weighted ${summary.executive.weightedPipelineDisplay}`,
      icon: TrendingUp,
      tone: "violet" as const,
      spark: spark(summary.openOpportunityCount ?? 0),
      href: "/opportunities",
    },
    {
      title: "Calls",
      value: String(summary.executive.callsInRange),
      sub: `${summary.executive.emailsInRange} emails · ${summary.executive.meetingsInRange} meetings`,
      icon: Phone,
      tone: "sky" as const,
      delta: <DeltaPill delta={summary.kpis.calls.delta} rangeLabel={labelForPrior} />,
      spark: spark(summary.executive.callsInRange),
      href: "/telephony/dialer",
    },
    {
      title: "Activities",
      value: String(summary.kpis.activities.value),
      sub: `${summary.activitiesToday} logged today`,
      icon: Target,
      tone: "amber" as const,
      delta: <DeltaPill delta={summary.kpis.activities.delta} rangeLabel={labelForPrior} />,
      spark: spark(summary.kpis.activities.value),
      href: "/activities",
    },
    {
      title: "Open deals",
      value: String(summary.openOpportunityCount ?? 0),
      sub: "Excl. won / lost",
      icon: DollarSign,
      tone: "rose" as const,
      spark: spark(summary.openOpportunityCount ?? 0),
      href: "/opportunities",
    },
    {
      title: "Open tasks",
      value: String(summary.openTasks),
      sub: `${summary.executive.tasksDueToday} due today`,
      icon: CheckSquare,
      tone: "emerald" as const,
      spark: spark(summary.openTasks),
      href: "/tasks",
    },
    {
      title: "Accounts",
      value: String(summary.accountCount),
      sub: "Active accounts",
      icon: Building2,
      tone: "blue" as const,
      spark: spark(summary.accountCount),
      href: "/accounts",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-crm-muted">{c.title}</p>
                <p className="mt-1 text-2xl font-semibold text-crm-text">{c.value}</p>
                {"delta" in c && c.delta ? <div className="mt-1">{c.delta}</div> : null}
                {c.sub ? <p className="mt-1 text-xs text-crm-muted">{c.sub}</p> : null}
              </div>
              <Icon className="h-7 w-7 shrink-0 opacity-80" strokeWidth={1.5} />
            </div>
            <div className="mt-3">
              <Sparkline values={c.spark} />
            </div>
          </>
        );
        if (onNavigate) {
          return (
            <button
              key={c.title}
              type="button"
              onClick={() => onNavigate(c.href)}
              className="crm-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={c.title} className="crm-card p-4">
            {inner}
          </div>
        );
      })}
    </div>
  );
});
