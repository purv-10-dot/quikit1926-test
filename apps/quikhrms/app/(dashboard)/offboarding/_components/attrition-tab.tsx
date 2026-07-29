"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { BarChartView, MultiColorBar, DonutView } from "@/components/hrms/charts";

interface AttritionData {
  year: number;
  totalExits: number;
  activeCount: number;
  attritionRate: number;
  avgTenureMonths: number;
  byMonth: { name: string; value: number }[];
  byDepartment: { name: string; value: number }[];
  byReason: { name: string; value: number }[];
}

const fmtTenure = (m: number) => {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return [y ? `${y}y` : "", mo ? `${mo}m` : ""].filter(Boolean).join(" ") || "0m";
};

export function AttritionTab() {
  const api = useApiClient();
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(String(nowYear));
  const yearOpts = Array.from({ length: 5 }, (_, i) => String(nowYear - i)).map((y) => ({ value: y, label: y }));

  const { data } = useQuery({
    queryKey: ["offboarding", "attrition", year],
    queryFn: () => api.get<AttritionData>(`/api/v1/hrms/offboarding/attrition?year=${year}`),
    staleTime: 30_000,
  });
  const d = data?.data;

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Attrition</h2>
        <div className="w-32"><Select value={year} onChange={setYear} options={yearOpts} size="sm" /></div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Total Exits" value={String(d?.totalExits ?? 0)} sub={`in ${year}`} accent="text-gray-900" />
        <StatTile label="Attrition Rate" value={`${d?.attritionRate ?? 0}%`} sub={`vs ${d?.activeCount ?? 0} active`} accent="text-red-600" />
        <StatTile label="Avg Tenure at Exit" value={fmtTenure(d?.avgTenureMonths ?? 0)} sub="joining → last day" accent="text-blue-600" />
      </div>

      {/* Charts */}
      <div className="surface-card p-4">
        <h3 className="text-xs font-semibold text-gray-700 mb-3">Exits by Month</h3>
        <BarChartView data={d?.byMonth ?? []} height={240} color="#ef4444" showValues />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-card p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Exits by Department</h3>
          {d && d.byDepartment.length > 0 ? (
            <MultiColorBar data={d.byDepartment} layout="vertical" height={260} />
          ) : (
            <EmptyChart />
          )}
        </div>
        <div className="surface-card p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3 text-center">Exits by Reason</h3>
          <DonutView data={d?.byReason ?? []} height={260} />
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex items-center justify-center h-[260px] text-xs text-gray-400">No data for this year</div>;
}
