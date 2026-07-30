"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { TrendLineChart, DonutView } from "@/components/hrms/charts";

interface DashboardData {
  year: number;
  month: number | null;
  tiles: {
    totalRequested: number;
    responded: number;
    notResponded: number;
    approved: number;
    rejected: number;
    selfCancelled: number;
  };
  series: { name: string; requested: number; approved: number; rejected: number }[];
  topTakers: { name: string; value: number }[];
}

const MONTH_OPTS = [
  { value: "", label: "All months" },
  ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({
    value: String(i + 1),
    label: m,
  })),
];

export function LeaveDashboardTab() {
  const api = useApiClient();
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(String(nowYear));
  const [month, setMonth] = useState("");

  const yearOpts = Array.from({ length: 5 }, (_, i) => String(nowYear - i)).map((y) => ({ value: y, label: y }));

  const { data } = useQuery({
    queryKey: ["leaves", "dashboard", year, month],
    queryFn: () => api.get<DashboardData>(`/api/v1/hrms/leaves/dashboard?year=${year}&month=${month}`),
    staleTime: 30_000,
  });
  const t = data?.data?.tiles;

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Leave Dashboard</h2>
        <div className="flex items-center gap-2">
          <div className="w-32"><Select value={year} onChange={setYear} options={yearOpts} size="sm" /></div>
          <div className="w-36"><Select value={month} onChange={setMonth} options={MONTH_OPTS} size="sm" /></div>
          <button
            type="button"
            onClick={() => { setYear(String(nowYear)); setMonth(""); }}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile title="Total Requested" value={t?.totalRequested ?? 0} accent="text-gray-900"
          subs={[["Responded", t?.responded ?? 0], ["Not Responded", t?.notResponded ?? 0]]} />
        <StatTile title="Total Approvals" value={t?.approved ?? 0} accent="text-blue-600"
          subs={[["Approved", t?.approved ?? 0]]} />
        <StatTile title="Total Rejected" value={(t?.rejected ?? 0) + (t?.selfCancelled ?? 0)} accent="text-red-600"
          subs={[["Rejected", t?.rejected ?? 0], ["Self Cancelled", t?.selfCancelled ?? 0]]} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="surface-card p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Requested vs Approved vs Rejected</h3>
          <TrendLineChart data={data?.data?.series ?? []} height={280} />
        </div>
        <div className="surface-card p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3 text-center">Most Leaves Taken By (Top 10)</h3>
          <DonutView data={data?.data?.topTakers ?? []} height={280} />
        </div>
      </div>
    </div>
  );
}

function StatTile({
  title, value, subs, accent,
}: { title: string; value: number; subs: [string, number][]; accent: string }) {
  return (
    <div className="surface-card p-4 text-center">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <p className={clsx("text-3xl font-bold mt-1", accent)}>{value}</p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }}>
        {subs.map(([label, v]) => (
          <div key={label} className="rounded-lg bg-gray-50 py-2">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
