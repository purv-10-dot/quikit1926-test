"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import type { ExecutiveReportData } from "./types";

interface Props {
  data: ExecutiveReportData;
}

interface ChartRow {
  week: string;
  current: number;
}

export function WeeklyTrendChart({ data }: Props) {
  const rows = useMemo<ChartRow[]>(
    () =>
      data.weeks.map((w, i) => ({
        week: w.weekLabel,
        current: data.series.productivity[i] ?? 0,
      })),
    [data],
  );

  const wow = data.weekOverWeek;
  const headlineDelta = wow.available ? wow.delta.productivity : null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Productivity by Week
            </h3>
            <Info className="h-3.5 w-3.5 text-gray-400" />
          </div>
          {wow.available && wow.thisWeekLabel && wow.lastWeekLabel && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{wow.thisWeekLabel}</span>{" "}
              vs{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">{wow.lastWeekLabel}</span>
              {headlineDelta !== null && (
                <span
                  className={`ml-2 font-semibold ${
                    headlineDelta === 0
                      ? "text-gray-500 dark:text-gray-400"
                      : headlineDelta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {headlineDelta === 0 ? "= " : headlineDelta > 0 ? "↑ " : "↓ "}
                  {Math.abs(headlineDelta)} pp
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <LegendDot color="#8b5cf6" label="Weekly productivity" />
        </div>
      </div>

      <div className="mt-3 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 16, right: 16, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
            <XAxis
              dataKey="week"
              tick={{ fill: "currentColor", fontSize: 11 }}
              className="text-gray-500 dark:text-gray-400"
              axisLine={{ stroke: "currentColor", opacity: 0.2 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "currentColor", fontSize: 11 }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#8b5cf6", strokeOpacity: 0.2, strokeWidth: 2 }} />
            <Line
              type="monotone"
              dataKey="current"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#8b5cf6" }}
              isAnimationActive
              animationDuration={400}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
      <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg px-3 py-2 text-xs">
      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>Productivity:</span>
          <span className="font-semibold tabular-nums">{p.value}%</span>
        </div>
      ))}
    </div>
  );
}
