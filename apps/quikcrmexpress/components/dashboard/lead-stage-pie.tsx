"use client";

import { useRouter } from "next/navigation";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./chart-card";
import { leadsByStageHref } from "@/lib/dashboard/urls";
import type { StageCount } from "@/lib/dashboard/types";

const PIE_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0891b2",
  "#4f46e5",
  "#64748b",
];

type DrillCtx = { fromIso?: string; toIso?: string; ownerId?: string | null };

export function LeadStagePie({
  data,
  drill,
}: {
  data: StageCount[];
  drill: DrillCtx;
}) {
  const router = useRouter();
  const rows = data.map((x) => ({ name: x.stage || "—", value: x.count }));

  return (
    <ChartCard title="Lead stage mix" subtitle="Share of leads per stage" height={280}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            cursor="pointer"
            onClick={(p: { name?: string }) => {
              if (p?.name) router.push(leadsByStageHref(p.name, drill));
            }}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} cursor="pointer" />
            ))}
          </Pie>
          <Tooltip formatter={(v) => [Number(v ?? 0), "Leads"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
