"use client";

import { useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Info, ChevronDown } from "lucide-react";
import type { ExecutiveReportData, WorkloadPoint } from "./types";

interface Props {
  data: ExecutiveReportData;
}

const TEAM_PALETTE = ["#8b5cf6", "#3b82f6", "#22d3ee", "#10b981", "#f97316", "#eab308", "#ec4899"];

export function WorkloadScatter({ data }: Props) {
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const points: WorkloadPoint[] = data.workload;

  const teamOptions = ["all", ...data.teams.map((t) => t.teamName)];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workload vs Productivity</h3>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {teamFilter === "all" ? "All Departments" : teamFilter}
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 text-xs max-h-60 overflow-y-auto">
              {teamOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTeamFilter(t);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    t === teamFilter ? "text-violet-600 dark:text-violet-400 font-medium" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {t === "all" ? "All Departments" : t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 h-[260px] flex-1 relative">
        {/* Quadrant labels — centered inside each quadrant (watermark style)
            and behind the points, so they never collide with the axis ticks
            in the corners. The x=100 / y=50 reference lines split the plot. */}
        <div className="pointer-events-none absolute left-14 right-5 top-6 bottom-10 grid grid-cols-2 grid-rows-2 text-[9px] z-0 font-medium leading-tight text-center">
          <div className="flex items-center justify-center text-blue-500/45 dark:text-blue-400/40">
            High Productivity<br />Low Workload
          </div>
          <div className="flex items-center justify-center text-amber-500/45 dark:text-amber-400/40">
            High Productivity<br />High Workload
          </div>
          <div className="flex items-center justify-center text-blue-500/35 dark:text-blue-400/30">
            Low Productivity<br />Low Workload
          </div>
          <div className="flex items-center justify-center text-red-500/45 dark:text-red-400/40">
            Low Productivity<br />High Workload
          </div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
            <ReferenceLine x={100} stroke="currentColor" className="text-gray-300 dark:text-gray-700" strokeDasharray="3 3" />
            <ReferenceLine y={50} stroke="currentColor" className="text-gray-300 dark:text-gray-700" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="workload"
              name="Workload"
              tick={{ fill: "currentColor", fontSize: 10 }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 200]}
              ticks={[0, 50, 100, 150, 200]}
              axisLine={{ stroke: "currentColor", opacity: 0.2 }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="productivity"
              name="Productivity"
              width={40}
              tick={{ fill: "currentColor", fontSize: 10 }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              axisLine={false}
              tickLine={false}
            />
            <ZAxis type="number" dataKey="tasksClosed" range={[60, 220]} name="Tasks closed" />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              data={points}
              fill={TEAM_PALETTE[0]}
              isAnimationActive
              animationDuration={400}
              shape={renderScatterShape}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center -mt-1">
        Workload (% of Capacity)
      </div>
    </div>
  );
}

function renderScatterShape(props: unknown): JSX.Element {
  const p = props as { cx?: number; cy?: number; node?: { z?: number } };
  const cx = p.cx ?? 0;
  const cy = p.cy ?? 0;
  const r = Math.max(5, Math.min(14, Math.sqrt(p.node?.z ?? 8) * 2));
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={TEAM_PALETTE[Math.floor(cx) % TEAM_PALETTE.length]}
      fillOpacity={0.85}
      stroke="#fff"
      strokeWidth={1}
    />
  );
}

interface ScatterTooltipItem {
  payload: WorkloadPoint;
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: ScatterTooltipItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg px-3 py-2 text-xs">
      <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
      <div className="mt-1 space-y-0.5 text-gray-600 dark:text-gray-300">
        <div>Productivity: <span className="font-semibold tabular-nums">{p.productivity}%</span></div>
        <div>Workload: <span className="font-semibold tabular-nums">{p.workload}%</span> of capacity</div>
        <div>Tasks closed: <span className="font-semibold tabular-nums">{p.tasksClosed}</span></div>
        <div>Hours logged: <span className="font-semibold tabular-nums">{p.hoursLogged}h</span></div>
      </div>
    </div>
  );
}
