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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const PALETTE = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#10b981"];

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

// Generic multi-series trend line — any named series, unlike TrendLineChart's
// fixed Requested/Approved/Rejected shape.
export function MultiLineChartView({
  data, series, height = 240,
}: {
  data: Array<{ name: string; [k: string]: number | string }>;
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Donut chart (top-N distribution).
export function DonutView({
  data, height = 260, colors, legendPosition = "right",
}: {
  data: BarDatum[];
  height?: number;
  colors?: string[];
  /** "right": legend as a vertical list at the right edge (default, existing look).
   *  "bottom": legend as a horizontal row centered under the donut — keeps the
   *  whole chart visually centered instead of leaving a lopsided gap when
   *  there are few legend items (e.g. just one status). */
  legendPosition?: "right" | "bottom";
}) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>No data</div>;
  }
  const palette = colors && colors.length ? colors : PALETTE;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}
          cx={legendPosition === "bottom" ? "50%" : undefined}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        {legendPosition === "bottom" ? (
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} layout="horizontal" align="center" verticalAlign="bottom" />
        ) : (
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} layout="vertical" align="right" verticalAlign="middle" />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}

// Stacked bar — e.g. Open vs Filled per recruiter. Each `keys` entry is one
// series stacked into the same bar.
export function StackedBarView({
  data, keys, height = 260,
}: {
  data: Array<{ name: string; [k: string]: number | string }>;
  keys: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} cursor={{ fill: "#f8fafc" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} radius={i === keys.length - 1 ? [4, 4, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Radar/spider chart — one polygon per series (e.g. per recruiter), compared
// across shared 0-100 normalized dimensions.
export function RadarCompareView({
  data, series, height = 300,
}: {
  data: Array<{ dimension: string; [k: string]: number | string }>;
  series: { key: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10.5, fill: "#64748b" }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} tickCount={5} />
        {series.map((s) => (
          <Radar key={s.key} name={s.key} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} />
        ))}
        <Legend wrapperStyle={{ fontSize: 10.5 }} iconSize={9} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// One vertical bar per recruiter's overall weighted Score (0-100) — a
// mixture of every KPI into a single number, colored by performance band
// (Excellent → Critical) so a glance says who's doing well vs. struggling.
const BAND_HEX: Record<string, string> = {
  Excellent: "#22c55e", Strong: "#10b981", "Needs Attention": "#f59e0b",
  "Below Expectations": "#f97316", Critical: "#ef4444",
};
export interface ScoreBarDatum { name: string; value: number; band: string }
export function ScoreBarChartView({ data, height = 280 }: { data: ScoreBarDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} cursor={{ fill: "#f8fafc" }}
          formatter={(value: number, _n, item) => [`${value} — ${(item?.payload as ScoreBarDatum)?.band}`, "Score"]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={BAND_HEX[d.band] ?? "#94a3b8"} />)}
          <LabelList dataKey="value" position="top" style={{ fontSize: 10.5, fontWeight: 700, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface FunnelDatum {
  name: string;
  value: number;
  /** Conversion from the immediately-preceding stage — null for the first stage. Self-computed from `value` when omitted. */
  stagePct?: number | null;
  /** Conversion from the funnel's first stage. Self-computed from `value` when omitted. */
  overallPct?: number;
}

/** Sequential recruitment/conversion funnel — each row shows both its own stage-to-stage conversion and its overall conversion from the top, so a reader can tell whether a leak is local to that stage or inherited from further up. */
export function FunnelView({ data, height = 280 }: { data: FunnelDatum[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const top = data[0]?.value ?? 0;
  return (
    <div className="w-full" style={{ minHeight: height }}>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => {
          const widthPct = (d.value / max) * 100;
          const overallPct = d.overallPct ?? (top > 0 ? Math.round((d.value / top) * 1000) / 10 : 0);
          const stagePct = d.stagePct !== undefined ? d.stagePct : (i > 0 && data[i - 1].value > 0 ? Math.round((d.value / data[i - 1].value) * 1000) / 10 : null);
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
              <div className="w-32 shrink-0 text-right text-[11px] leading-tight">
                <div className="font-semibold text-gray-700">{stagePct != null ? `${stagePct}% stage` : "Top of funnel"}</div>
                <div className="text-gray-400">{overallPct}% overall</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
