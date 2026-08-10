"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./chart-card";
import type { ActivityMix } from "@/lib/dashboard/types";

const COLORS = ["#0ea5e9", "#2563eb", "#7c3aed", "#94a3b8"];

export function ActivityMixChart({ mix, rangeDescription }: { mix: ActivityMix; rangeDescription: string }) {
  const data = [
    { name: "Calls", value: mix.calls },
    { name: "Emails", value: mix.emails },
    { name: "Meetings", value: mix.meetings },
    { name: "Other", value: mix.other },
  ].filter((d) => d.value > 0);

  if (mix.total === 0) {
    return (
      <ChartCard title="Activity mix" subtitle={`Touchpoints in ${rangeDescription}`} height={220}>
        <p className="flex h-full items-center justify-center text-sm text-crm-muted">
          No activities in this period.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Activity mix" subtitle={`Calls, emails, meetings · ${rangeDescription}`} height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
