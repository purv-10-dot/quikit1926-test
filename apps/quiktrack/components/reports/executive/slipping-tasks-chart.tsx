"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, ChevronDown } from "lucide-react";
import type { ExecutiveReportData } from "./types";

interface Props {
  data: ExecutiveReportData;
}

type Mode = "all" | "slipped" | "blocked";

export function SlippingTasksChart({ data }: Props) {
  const [mode, setMode] = useState<Mode>("all");
  const [open, setOpen] = useState(false);
  const totalCreated = Math.max(1, data.summary.totalCreated);

  const rows = data.slipping.map((p) => ({
    week: p.weekLabel,
    pct: Math.round(((p.slipped + p.blocked) / totalCreated) * 100),
    slippedPct: Math.round((p.slipped / totalCreated) * 100),
    blockedPct: Math.round((p.blocked / totalCreated) * 100),
    slipped: p.slipped,
    blocked: p.blocked,
  }));

  const showSlipped = mode === "all" || mode === "slipped";
  const showBlocked = mode === "all" || mode === "blocked";

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Slipping Tasks Trend</h3>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {modeLabel(mode)}
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 z-20 w-32 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 text-xs">
              {(["all", "slipped", "blocked"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    m === mode ? "text-violet-600 dark:text-violet-400 font-medium" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {modeLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">% of Tasks</div>

      <div className="mt-1 h-[240px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
            <defs>
              <linearGradient id="slipGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="blockGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
            <XAxis
              dataKey="week"
              tick={{ fill: "currentColor", fontSize: 10 }}
              className="text-gray-500 dark:text-gray-400"
              tickLine={false}
              axisLine={{ stroke: "currentColor", opacity: 0.2 }}
            />
            <YAxis
              tick={{ fill: "currentColor", fontSize: 10 }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<SlipTooltip />} />
            {showSlipped && (
              <Area
                type="monotone"
                dataKey="slippedPct"
                name="Slipped"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#slipGrad)"
                isAnimationActive
                animationDuration={400}
              />
            )}
            {showBlocked && (
              <Area
                type="monotone"
                dataKey="blockedPct"
                name="Blocked"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#blockGrad)"
                isAnimationActive
                animationDuration={400}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function modeLabel(m: Mode): string {
  if (m === "all") return "All Tasks";
  if (m === "slipped") return "Slipped only";
  return "Blocked only";
}

interface TooltipPayloadItem {
  name?: string;
  dataKey: string;
  value: number;
  color: string;
  payload: { slipped: number; blocked: number };
}

function SlipTooltip({
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
          <span>{p.name ?? p.dataKey}:</span>
          <span className="font-semibold tabular-nums">{p.value}%</span>
          <span className="text-gray-400">
            ({p.dataKey === "slippedPct" ? p.payload.slipped : p.payload.blocked} tasks)
          </span>
        </div>
      ))}
    </div>
  );
}
