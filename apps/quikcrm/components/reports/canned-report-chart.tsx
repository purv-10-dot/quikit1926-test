"use client";

/**
 * Renders the optional `chart` block on a canned report's result via
 * Recharts. Bar / line / pie are the three shapes the catalog produces;
 * anything else falls back silently (no chart rendered).
 */
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

export interface CannedReportChartProps {
  type: "bar" | "line" | "pie";
  xKey: string;
  yKey: string;
  rows: Record<string, unknown>[];
}

export function CannedReportChart({ type, xKey, yKey, rows }: CannedReportChartProps) {
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
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        {type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey={yKey} fill={PALETTE[0]} radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
            <Tooltip />
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
            <Tooltip />
            <Pie
              data={data}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={90}
              label
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
