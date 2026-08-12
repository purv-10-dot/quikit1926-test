"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LeadAnalyticsBundle } from "@/lib/services/leads/lead-analytics";
import { ChartCard } from "@/components/dashboard/chart-card";

interface Props {
  analytics: LeadAnalyticsBundle;
  stage: string;
  conversionProbability: number;
}

function MiniLine({
  title,
  subtitle,
  data,
  dataKey,
  color,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: number }[];
  dataKey: string;
  color: string;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={32} />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LeadAnalyticsTab({ analytics, stage, conversionProbability }: Props) {
  const activityRows = analytics.activityTrend.map((p) => ({
    label: p.label,
    value: p.value,
  }));
  const engagementRows = analytics.engagementTrend.map((p) => ({
    label: p.label,
    value: p.value,
  }));
  const scoreRows = analytics.scoreTrend.map((p) => ({ label: p.label, value: p.value }));
  const responseRows = analytics.responseTimeHours.map((p) => ({
    label: p.label,
    value: p.value,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-crm-border bg-gradient-to-r from-accent-50 to-violet-50 p-4 dark:from-accent-950/30 dark:to-violet-950/20">
        <p className="text-sm text-crm-muted">Conversion progress</p>
        <p className="mt-1 text-lg font-semibold text-crm-text">
          {stage} · {conversionProbability}% modeled probability
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
          <div
            className="h-full rounded-full bg-accent-600 transition-all"
            style={{ width: `${conversionProbability}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MiniLine
          title="Activity trend"
          subtitle="Touchpoints per day (14d)"
          data={activityRows}
          dataKey="value"
          color="#2563eb"
        />
        <MiniLine
          title="Engagement trend"
          subtitle="Weighted engagement index"
          data={engagementRows}
          dataKey="value"
          color="#7c3aed"
        />
        <MiniLine
          title="Lead score trend"
          subtitle="Modeled score trajectory"
          data={scoreRows}
          dataKey="value"
          color="#059669"
        />
        <MiniLine
          title="Response time (hrs)"
          subtitle="Estimated hours to respond"
          data={responseRows}
          dataKey="value"
          color="#d97706"
        />
      </div>
    </div>
  );
}
