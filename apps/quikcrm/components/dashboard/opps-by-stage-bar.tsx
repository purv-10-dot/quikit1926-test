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
import { opportunitiesByStageHref } from "@/lib/dashboard/urls";
import type { StageCount } from "@/lib/dashboard/types";

type DrillCtx = { fromIso?: string; toIso?: string; ownerId?: string | null };

export function OppsByStageBar({
  data,
  drill,
}: {
  data: StageCount[];
  drill: DrillCtx;
}) {
  const router = useRouter();
  const rows = data.map((x) => ({ stage: x.stage || "—", deals: x.count }));

  return (
    <ChartCard
      title="Open deals by stage"
      subtitle="Opportunity count per stage (Won and Lost excluded)"
      height={260}
    >
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-crm-muted">No open opportunities yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="stage"
              width={100}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (String(v).length > 14 ? `${String(v).slice(0, 12)}…` : String(v))}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(v) => [Number(v ?? 0), "Deals"]}
            />
            <Bar
              dataKey="deals"
              fill="#7c3aed"
              radius={[0, 4, 4, 0]}
              name="Open deals"
              cursor="pointer"
              onClick={(p: { stage?: string }) => {
                if (p?.stage) router.push(opportunitiesByStageHref(p.stage, drill));
              }}
            >
              {rows.map((r) => (
                <Cell key={r.stage} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
