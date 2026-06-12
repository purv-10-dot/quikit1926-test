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
import type { AccountScoreHistoryBundle } from "@/lib/services/accounts/account-score-history";
import { ChartCard } from "@/components/dashboard/chart-card";

interface Props {
  history: AccountScoreHistoryBundle;
}

function MiniLine({
  title,
  subtitle,
  data,
  color,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: number }[];
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
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AccountScoreTrendsTab({ history }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-crm-muted">
        Trends are derived from account touchpoints and won opportunity revenue (14 days). Historical
        score snapshots will refine these charts over time.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-crm-border bg-white p-4">
          <p className="text-xs text-crm-muted">Current health</p>
          <p className="text-2xl font-semibold text-crm-text">{history.currentHealth}%</p>
        </div>
        <div className="rounded-xl border border-crm-border bg-white p-4">
          <p className="text-xs text-crm-muted">Engagement index</p>
          <p className="text-2xl font-semibold text-crm-text">{history.currentEngagement}%</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MiniLine
          title="Health trend"
          subtitle="Modeled from health score + activity"
          data={history.healthTrend.map((p) => ({ label: p.label, value: p.value }))}
          color="#059669"
        />
        <MiniLine
          title="Engagement trend"
          subtitle="Touchpoints per day"
          data={history.engagementTrend.map((p) => ({ label: p.label, value: p.value }))}
          color="#7c3aed"
        />
        <MiniLine
          title="Revenue trend"
          subtitle="Won opportunity revenue (indexed)"
          data={history.revenueTrend.map((p) => ({ label: p.label, value: p.value }))}
          color="#2563eb"
        />
      </div>
    </div>
  );
}
