"use client";

import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, AreaChart, Area,
} from "recharts";
import { Info, MoreVertical, GripVertical } from "lucide-react";
import { clsx } from "clsx";

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  benchmark?: number;
}

interface SeriesPoint { label: string; value: number }
interface PieSlice { name: string; value: number }

interface WidgetData {
  type: string;
  metric?: { value: number; delta?: number; format: "number" | "percent" | "currency" };
  series?: SeriesPoint[];
  rolling?: SeriesPoint[];
  pie?: PieSlice[];
  benchmark?: number;
}

const PIE_COLORS = ["#3b82f6", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#a855f7", "#ef4444"];

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function formatMetric(v: number, fmt: "number" | "percent" | "currency"): string {
  if (fmt === "percent") return `${v}%`;
  if (fmt === "currency") return `₹${INR.format(v)}`;
  return INR.format(v);
}

export function Widget({
  config, months = 12, variant = "card", kpiIcon: KpiIcon,
}: {
  config: WidgetConfig;
  months?: number;
  variant?: "card" | "kpi";
  kpiIcon?: LucideIcon;
}) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["widget", config.type, months],
    queryFn: () => api.get<WidgetData>(`/api/v1/hrms/dashboards/widget-data?type=${config.type}&months=${months}`),
    staleTime: 60_000,
  });
  const w = data?.data;

  // Compact KPI tile — used in the metric strip at the top of a dashboard.
  if (variant === "kpi") {
    const delta = w?.metric?.delta;
    return (
      <div className="surface-card p-4 h-full">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">{config.title}</p>
          {KpiIcon && (
            <div className="w-7 h-7 rounded-md bg-blue-50 text-[#3b82f6] flex items-center justify-center shrink-0">
              <KpiIcon size={14} />
            </div>
          )}
        </div>
        {isLoading || !w ? (
          <div className="mt-3 h-7 w-16 bg-gray-100 rounded animate-pulse" />
        ) : (
          <>
            <p className="mt-2 font-serif-display text-2xl md:text-3xl font-bold text-gray-900 tabular-nums leading-none">
              {w.metric ? formatMetric(w.metric.value, w.metric.format) : "—"}
            </p>
            {delta != null ? (
              <p className={clsx("mt-1.5 text-[11px] font-semibold inline-flex items-center gap-0.5", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% <span className="font-normal text-gray-400">vs prior</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-gray-400">vs prior {months}m</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-300 cursor-grab" />
          <h3 className="text-sm font-bold text-gray-900">{config.title}</h3>
          <Info size={12} className="text-gray-300" />
        </div>
        <button className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
          <MoreVertical size={14} />
        </button>
      </div>

      {isLoading || !w ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1">
          {renderWidget(config, w)}
        </div>
      )}
    </div>
  );
}

function renderWidget(config: WidgetConfig, w: WidgetData) {
  const benchmark = config.benchmark ?? w.benchmark;

  switch (w.type) {
    case "headcount-trend":
    case "new-hires":
    case "terminations": {
      const series = w.series ?? [];
      return (
        <div className="h-64">
          {w.metric && <Metric value={w.metric.value} delta={w.metric.delta} format={w.metric.format} />}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id={`grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area dataKey="value" stroke="#3b82f6" fill={`url(#grad-${config.id})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }
    case "turnover-rate":
    case "attrition-rate": {
      const series = w.series ?? [];
      const rolling = w.rolling ?? [];
      const merged = series.map((s, i) => ({
        label: s.label, monthly: s.value, rolling: rolling[i]?.value ?? 0,
      }));
      return (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {benchmark != null && (
                <ReferenceLine
                  y={benchmark}
                  stroke="#0f172a"
                  strokeDasharray="4 4"
                  label={{ value: "Industry benchmark", fontSize: 9, fill: "#0f172a", position: "insideTopRight" }}
                />
              )}
              <Bar dataKey="monthly" fill="#fde68a" name={w.type === "turnover-rate" ? "Turnover" : "Attrition"} />
              <Line type="monotone" dataKey="rolling" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} name="Rolling 12-month" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }
    case "headcount-by-department":
    case "headcount-by-gender":
    case "pipeline-funnel": {
      // Descending centered bars — reads as a recruitment funnel.
      const stages = w.pie ?? [];
      const max = Math.max(1, ...stages.map((s) => s.value));
      return (
        <div className="h-64 flex flex-col justify-center gap-1.5 px-2">
          {stages.length === 0 ? (
            <p className="text-center text-xs text-gray-400">No active pipeline.</p>
          ) : (
            stages.map((s, i) => {
              const pct = Math.max(8, Math.round((s.value / max) * 100));
              return (
                <div key={s.name} className="flex flex-col items-center">
                  <div
                    className="rounded-md text-white text-xs font-semibold flex items-center justify-center py-1.5 transition-all"
                    style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                    title={`${s.name}: ${s.value}`}
                  >
                    <span className="truncate px-2">{s.name} · {s.value}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      );
    }
    case "headcount-by-department":
    case "headcount-by-gender":
    case "headcount-by-location":
    case "tenure-distribution":
    case "age-distribution":
    case "salary-by-department":
    case "aging-requisitions":
    case "top-hiring-departments":
    case "top-sources-by-hires":
    case "open-positions-by-department": {
      const pie = w.pie ?? [];
      const total = pie.reduce((s, p) => s + p.value, 0);
      const isMoney = w.type === "salary-by-department";
      return (
        <div className="h-64 flex items-center gap-4">
          <div className="relative w-[50%] h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                  {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            {/* Donut center total */}
            {!isMoney && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-serif-display text-2xl font-bold text-gray-900 tabular-nums leading-none">{total}</span>
                <span className="text-[9px] text-gray-400 uppercase tracking-wide">total</span>
              </div>
            )}
          </div>
          <ul className="flex-1 space-y-1 text-xs overflow-y-auto max-h-56">
            {pie.slice(0, 8).map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="truncate text-gray-700">{p.name}</span>
                </span>
                <span className="font-semibold text-gray-900">
                  {w.type === "salary-by-department" ? `₹${INR.format(p.value)}` : p.value}
                  {total > 0 && w.type !== "salary-by-department" && (
                    <span className="text-gray-400 ml-1 font-normal">({Math.round((p.value / total) * 100)}%)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "open-positions":
    case "time-to-hire":
    case "promotions-this-year":
    case "internal-mobility":
    case "ctc-spend":
    case "offer-acceptance-rate":
    case "candidates-interviewed":
    case "recruitment-sources": {
      if (!w.metric) return <div className="text-sm text-gray-400">No data</div>;
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <p className="font-serif-display text-6xl font-bold text-gray-900">{formatMetric(w.metric.value, w.metric.format)}</p>
            {w.metric.delta != null && (
              <p className={clsx("text-xs mt-2 font-semibold", w.metric.delta >= 0 ? "text-emerald-600" : "text-red-600")}>
                {w.metric.delta >= 0 ? "+" : ""}{w.metric.delta} vs prior period
              </p>
            )}
          </div>
        </div>
      );
    }
    default:
      return <div className="text-xs text-gray-400">Widget type not supported</div>;
  }
}

function Metric({ value, delta, format }: { value: number; delta?: number; format: "number" | "percent" | "currency" }) {
  return (
    <div className="absolute top-3 right-5 text-right">
      <p className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{formatMetric(value, format)}</p>
      {delta != null && (
        <p className={clsx("text-[10px] font-semibold", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
          {delta >= 0 ? "+" : ""}{delta}
        </p>
      )}
    </div>
  );
}
