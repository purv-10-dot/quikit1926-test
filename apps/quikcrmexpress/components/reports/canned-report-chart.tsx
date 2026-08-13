"use client";

/**
 * Renders the optional `chart` block on a canned report's result via
 * Recharts. Bar / line / pie are the three shapes the catalog produces;
 * anything else falls back silently (no chart rendered).
 *
 * Values are formatted to match the table (currency in en-IN, talk time as
 * HH:MM:SS, percentages), and bar/pie segments drill into the same target
 * as the table row when the report supplies a `_drillUrl`.
 */
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = [
  "#2563eb",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#a855f7",
  "#14b8a6",
  "#ef4444",
];

// Mirrors `ReportColumn["format"]` so the y-column's format can be passed
// straight through. "date" never applies to a measured value, so it just
// falls through to the default numeric formatting below.
export type ChartValueFormat =
  | "number"
  | "currency"
  | "percent"
  | "duration"
  | "date";

export interface CannedReportChartProps {
  type: "bar" | "line" | "pie";
  xKey: string;
  yKey: string;
  rows: Record<string, unknown>[];
  /** Formatting for the measured value — mirrors the table column's format. */
  valueFormat?: ChartValueFormat;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "00:00:00";
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Full value, used in tooltips. */
function formatValue(value: number, fmt?: ChartValueFormat): string {
  if (!Number.isFinite(value)) return String(value);
  switch (fmt) {
    case "currency":
      return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
    case "percent":
      return `${value}%`;
    case "duration":
      return formatDuration(value);
    default:
      return value.toLocaleString("en-IN");
  }
}

/** Compact value, used on axis ticks so they don't overflow. */
function formatTick(value: number, fmt?: ChartValueFormat): string {
  if (!Number.isFinite(value)) return String(value);
  if (fmt === "duration") return `${Math.round(value / 60)}m`;
  if (fmt === "percent") return `${value}%`;
  const compact = new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return fmt === "currency" ? `₹${compact}` : compact;
}

/** Trim long category labels so axes stay readable. */
function shortLabel(value: unknown): string {
  const s = String(value ?? "");
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

export function CannedReportChart({
  type,
  xKey,
  yKey,
  rows,
  valueFormat,
}: CannedReportChartProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="grid h-56 place-items-center rounded-lg border border-dashed border-crm-border text-sm text-crm-muted">
        No data for the current filters.
      </div>
    );
  }

  const data = rows.map((r) => ({
    [xKey]: r[xKey] ?? "",
    [yKey]: Number(r[yKey] ?? 0),
    _drill: typeof r._drillUrl === "string" ? (r._drillUrl as string) : null,
  }));

  // High-cardinality dimensions (e.g. "leads by source" with 60+ sources)
  // make bar/pie charts unreadable — hair-thin bars and overlapping labels.
  // Cap the chart to the top categories and roll the rest into "Others"; the
  // table below still lists every row. Line (time series) is never capped.
  const maxCategories = type === "pie" ? 8 : 12;
  const chartData =
    type === "line" || data.length <= maxCategories
      ? data
      : (() => {
          const sorted = [...data].sort(
            (a, b) => Number(b[yKey] ?? 0) - Number(a[yKey] ?? 0),
          );
          const head = sorted.slice(0, maxCategories - 1);
          const rest = sorted.slice(maxCategories - 1);
          const restValue = rest.reduce((s, r) => s + Number(r[yKey] ?? 0), 0);
          return [
            ...head,
            { [xKey]: `Others (${rest.length})`, [yKey]: restValue, _drill: null },
          ];
        })();
  const hasDrill = chartData.some((d) => d._drill);

  // Surface the cap so the chart is never silently truncated — the user
  // should know at a glance that they're looking at the top N, not everything.
  const capped = type !== "line" && data.length > maxCategories;
  const shownCount = maxCategories - 1;
  const othersCount = data.length - shownCount;

  // Recharts hands the clicked datum's payload; we only need its `_drill`.
  function handleDrill(entry: { _drill?: string | null } | undefined) {
    const url = entry?._drill;
    if (typeof url === "string" && url) router.push(url);
  }

  // Param typed `unknown` so it satisfies Recharts' broad ValueType (which
  // includes arrays); Number() coerces whatever the tooltip hands us.
  const tooltipFormatter = (value: unknown) =>
    formatValue(Number(value), valueFormat);

  return (
    <div className="space-y-2">
      {capped && (
        <div className="flex items-start gap-1.5 rounded-md border border-crm-border bg-crm-panel px-2.5 py-1.5 text-[11px] leading-relaxed text-crm-muted">
          <Info size={13} className="mt-px shrink-0 text-accent-600" />
          <span>
            Showing the <span className="font-medium text-crm-text">top {shownCount}</span>{" "}
            of {data.length} · the remaining {othersCount} are grouped as{" "}
            <span className="font-medium text-crm-text">“Others”</span>. See the full
            list in the table below.
          </span>
        </div>
      )}
      <div className="h-64 w-full">
        <ResponsiveContainer>
        {type === "bar" ? (
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              fontSize={12}
              tickFormatter={shortLabel}
              interval={0}
              angle={chartData.length > 6 ? -30 : 0}
              textAnchor={chartData.length > 6 ? "end" : "middle"}
              height={chartData.length > 6 ? 64 : 30}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              allowDecimals={false}
              tickFormatter={(v: number) => formatTick(v, valueFormat)}
              width={56}
            />
            <Tooltip formatter={tooltipFormatter} cursor={{ fill: "#f1f5f9" }} />
            <Bar
              dataKey={yKey}
              fill={PALETTE[0]}
              radius={[6, 6, 0, 0]}
              maxBarSize={72}
              cursor={hasDrill ? "pointer" : undefined}
              onClick={hasDrill ? handleDrill : undefined}
            />
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              fontSize={12}
              tickFormatter={shortLabel}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              allowDecimals={false}
              tickFormatter={(v: number) => formatTick(v, valueFormat)}
              width={56}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={PALETTE[0]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        ) : (
          <PieChart>
            <Tooltip formatter={tooltipFormatter} />
            <Pie
              data={chartData}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={90}
              label
              cursor={hasDrill ? "pointer" : undefined}
              onClick={hasDrill ? handleDrill : undefined}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
