"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
  PieChart,
  Pie,
} from "recharts";

const PALETTE = ["#22c55e", "#22c55e", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

interface BarDatum {
  name: string;
  value: number;
}

export function BarChartView({
  data,
  height = 240,
  color = "#22c55e",
  layout = "horizontal",
  showValues = false,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  layout?: "horizontal" | "vertical";
  showValues?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, left: layout === "vertical" ? 60 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        {layout === "horizontal" ? (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
          </>
        ) : (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={120} />
          </>
        )}
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}>
          {showValues && <LabelList dataKey="value" position={layout === "vertical" ? "right" : "top"} style={{ fontSize: 10, fill: "#475569" }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MultiColorBar({
  data,
  height = 260,
  layout = "horizontal",
}: {
  data: BarDatum[];
  height?: number;
  layout?: "horizontal" | "vertical";
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, left: layout === "vertical" ? 60 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        {layout === "horizontal" ? (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
          </>
        ) : (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={140} />
          </>
        )}
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey="value" radius={[4, 4, 4, 4]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
          <LabelList dataKey="value" position={layout === "vertical" ? "right" : "top"} style={{ fontSize: 10, fill: "#475569" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartView({
  data,
  height = 240,
  color = "#ef4444",
  yLabel,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  yLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b" } } : undefined} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Multi-series trend line — Requested / Approved / Rejected over a period.
interface TrendDatum { name: string; requested: number; approved: number; rejected: number }

export function TrendLineChart({ data, height = 260 }: { data: TrendDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        <Line type="monotone" dataKey="requested" name="Requested" stroke="#ec4899" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="approved" name="Approved" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Donut chart (top-N distribution).
export function DonutView({ data, height = 260 }: { data: BarDatum[]; height?: number }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface FunnelDatum {
  name: string;
  value: number;
}

export function FunnelView({ data, height = 280 }: { data: FunnelDatum[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const top = data[0]?.value ?? 0;
  return (
    <div className="w-full" style={{ minHeight: height }}>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => {
          const widthPct = (d.value / max) * 100;
          const conv = top > 0 ? Math.round((d.value / top) * 100) : 0;
          const dropFromPrev = i > 0 && data[i - 1].value > 0 ? Math.round(((data[i - 1].value - d.value) / data[i - 1].value) * 100) : 0;
          const color = PALETTE[i % PALETTE.length];
          return (
            <div key={d.name} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs font-medium text-gray-700 truncate" title={d.name}>{d.name}</div>
              <div className="flex-1 relative h-9 rounded bg-gray-50">
                <div
                  className="h-full rounded transition-all flex items-center justify-end px-2 text-[11px] font-semibold text-white"
                  style={{ width: `${widthPct}%`, backgroundColor: color, minWidth: "30px" }}
                >
                  {d.value}
                </div>
              </div>
              <div className="w-28 shrink-0 text-right text-[11px]">
                <span className="font-semibold text-gray-700">{conv}%</span>
                <span className="text-gray-400 ml-1">of top</span>
                {i > 0 && dropFromPrev > 0 && (
                  <div className="text-[10px] text-red-500">−{dropFromPrev}% drop</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
