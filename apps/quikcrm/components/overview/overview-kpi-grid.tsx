"use client";

import {
  Briefcase,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DeltaPill } from "@/components/dashboard/delta-pill";
import type { ExecutiveOverviewDto } from "@/lib/dashboard/executive-overview-types";

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

function sparkFrom(n: number) {
  return Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(n * (0.4 + (i + 1) / 12))));
}

export function OverviewKpiGrid({
  data,
  priorLabel,
  rangeDescription,
}: {
  data: ExecutiveOverviewDto;
  priorLabel: string;
  rangeDescription: string;
}) {
  const k = data.executiveKpis;

  const cards = [
    {
      title: "Total leads",
      value: String(k.totalLeads.value),
      icon: UserPlus,
      tone: "blue" as const,
      delta: <DeltaPill delta={k.totalLeads.delta} rangeLabel={priorLabel} />,
      spark: sparkFrom(k.totalLeads.value),
    },
    {
      title: "New leads today",
      value: String(k.newLeadsToday.value),
      icon: Zap,
      tone: "sky" as const,
      delta: <DeltaPill delta={k.newLeadsToday.delta} rangeLabel="yesterday" />,
      spark: sparkFrom(k.newLeadsToday.value),
    },
    {
      title: "Active opportunities",
      value: String(k.activeOpportunities.value),
      icon: Briefcase,
      tone: "violet" as const,
      sub: "Open pipeline",
      spark: sparkFrom(k.activeOpportunities.value),
    },
    {
      title: "Deals won",
      value: String(k.dealsWon.value),
      icon: Trophy,
      tone: "emerald" as const,
      delta: <DeltaPill delta={k.dealsWon.delta} rangeLabel={priorLabel} />,
      spark: sparkFrom(k.dealsWon.value),
    },
    {
      title: "Deals lost",
      value: String(k.dealsLost.value),
      icon: TrendingDown,
      tone: "rose" as const,
      delta: (
        <DeltaPill delta={k.dealsLost.delta} rangeLabel={priorLabel} goodWhenLow />
      ),
      spark: sparkFrom(k.dealsLost.value),
    },
    {
      title: "Pipeline value",
      value: k.pipelineValueDisplay,
      icon: DollarSign,
      tone: "amber" as const,
      sub: rangeDescription,
      spark: sparkFrom(k.activeOpportunities.value),
    },
    {
      title: "Revenue this month",
      value: k.revenueThisMonthDisplay,
      icon: TrendingUp,
      tone: "emerald" as const,
      sub: "Closed won",
      spark: sparkFrom(k.dealsWon.value),
    },
    {
      title: "Team productivity",
      value: `${k.teamProductivityScore}/100`,
      icon: Users,
      tone: "blue" as const,
      sub: `Prior ${k.teamProductivityPrior}/100`,
      spark: sparkFrom(k.teamProductivityScore),
    },
  ];

  return (
    <section aria-label="Executive KPIs">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.title}
            title={c.title}
            value={c.value}
            sub={c.sub}
            icon={c.icon}
            tone={c.tone}
            delta={c.delta}
            footnote={<Sparkline values={c.spark} />}
          />
        ))}
      </div>
    </section>
  );
}

export function OverviewActivitySummary({
  data,
  priorLabel,
}: {
  data: ExecutiveOverviewDto;
  priorLabel: string;
}) {
  const s = data.activitySummary;
  const items = [
    { label: "Calls made", kpi: s.calls },
    { label: "Emails sent", kpi: s.emails },
    { label: "Meetings booked", kpi: s.meetings },
    { label: "Tasks completed", kpi: s.tasksCompleted },
    { label: "Notes added", kpi: s.notesAdded },
    { label: "Quotes sent", kpi: s.quotesSent },
    { label: "Follow-ups done", kpi: s.followUpsCompleted },
  ];

  return (
    <section aria-label="Activity summary">
      <h2 className="mb-3 text-sm font-semibold text-crm-text">User activity intelligence</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {items.map((item) => (
          <div key={item.label} className="crm-card p-3">
            <p className="text-xs text-crm-muted">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-crm-text">{item.kpi.value}</p>
            <div className="mt-1">
              <DeltaPill delta={item.kpi.delta} rangeLabel={priorLabel} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
