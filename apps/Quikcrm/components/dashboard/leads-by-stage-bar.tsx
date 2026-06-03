"use client";

import { useRouter } from "next/navigation";
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
import { leadsByStageHref } from "@/lib/dashboard/urls";
import type { StageCount } from "@/lib/dashboard/types";

type DrillCtx = { fromIso?: string; toIso?: string; ownerId?: string | null };

export function LeadsByStageBar({
  data,
  drill,
}: {
  data: StageCount[];
  drill: DrillCtx;
}) {
  const router = useRouter();
  const rows = data.map((x) => ({ stage: x.stage || "—", leads: x.count }));

  return (
    <ChartCard
      title="Leads by stage"
      subtitle="Lead record counts per stage (click a bar to drill in)"
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="stage"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={56}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(v) => [Number(v ?? 0), "Leads"]}
          />
          <Bar
            dataKey="leads"
            fill="#2563eb"
            radius={[4, 4, 0, 0]}
            name="Leads"
            cursor="pointer"
            onClick={(p: { stage?: string }) => {
              if (p?.stage) router.push(leadsByStageHref(p.stage, drill));
            }}
          >
            {rows.map((r) => (
              <Cell key={r.stage} cursor="pointer" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
