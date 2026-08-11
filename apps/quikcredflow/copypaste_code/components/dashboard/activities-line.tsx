"use client";

import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./chart-card";
import { activitiesByDayHref } from "@/lib/dashboard/urls";
import type { DayBucket } from "@/lib/dashboard/types";

export function ActivitiesLine({
  data,
  ownerId,
  rangeDescription,
}: {
  data: DayBucket[];
  ownerId?: string | null;
  rangeDescription: string;
}) {
  const router = useRouter();
  const rows = data.map((d) => ({ label: d.label, iso: d.iso, activities: d.count }));

  return (
    <ChartCard
      title="Activities per day"
      subtitle={`Logged activities by calendar day (${rangeDescription})`}
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          onClick={(state: { activeLabel?: string }) => {
            if (!state?.activeLabel) return;
            const found = rows.find((r) => r.label === state.activeLabel);
            if (found) router.push(activitiesByDayHref(found.iso, { ownerId }));
          }}
          style={{ cursor: "pointer" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={48}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(v) => [Number(v ?? 0), "Activities"]}
          />
          <Line
            type="monotone"
            dataKey="activities"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3, fill: "#2563eb" }}
            name="Activities"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
