"use client";

import { useState, useEffect } from "react";
import { LineChart, TrendingUp } from "lucide-react";

function scoreColor(score: number | null) {
  if (score === null) return "bg-gray-200";
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-400";
  return "bg-red-400";
}

function Skeleton() {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      <div className="h-48 bg-gray-200 rounded-lg" />
      <div className="h-40 bg-gray-200 rounded-lg" />
    </div>
  );
}

function CSSBarChart({ data }: { data: { label: string; kpiAttainment: number | null; priorityRate: number | null }[] }) {
  const maxH = 120;
  return (
    <div className="flex items-end gap-2 px-2" style={{ height: maxH + 24 }}>
      {data.map(d => {
        const kpiH = d.kpiAttainment != null ? Math.round((d.kpiAttainment / 100) * maxH) : 0;
        const prH = d.priorityRate != null ? Math.round((d.priorityRate / 100) * maxH) : 0;
        const hasData = d.kpiAttainment != null || d.priorityRate != null;
        return (
          <div key={d.label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: maxH }}>
              {/* KPI bar */}
              <div
                className={`w-4 rounded-t transition-all ${d.kpiAttainment != null ? scoreColor(d.kpiAttainment) : "bg-gray-100"}`}
                style={{ height: kpiH || (hasData ? 2 : 0) }}
                title={`KPI: ${d.kpiAttainment != null ? d.kpiAttainment + "%" : "—"}`}
              />
              {/* Priority bar */}
              <div
                className={`w-4 rounded-t transition-all ${d.priorityRate != null ? "bg-purple-400" : "bg-gray-100"}`}
                style={{ height: prH || (hasData ? 2 : 0) }}
                title={`Priority: ${d.priorityRate != null ? d.priorityRate + "%" : "—"}`}
              />
            </div>
            <span className="text-[10px] text-gray-500 truncate max-w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CSSLineChart({ data }: { data: { week: number; avgValue: number | null }[] }) {
  const maxH = 80;
  const validValues = data.filter(d => d.avgValue != null).map(d => d.avgValue as number);
  const maxVal = validValues.length > 0 ? Math.max(...validValues) : 100;

  return (
    <div className="flex items-end gap-1 px-2" style={{ height: maxH + 20 }}>
      {data.map(d => {
        const h = d.avgValue != null ? Math.max(2, Math.round((d.avgValue / (maxVal || 1)) * maxH)) : 0;
        return (
          <div key={d.week} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div
              className={`w-full rounded-t transition-all ${d.avgValue != null ? "bg-blue-500" : "bg-gray-100"}`}
              style={{ height: h, maxWidth: 20, margin: "0 auto" }}
              title={`W${d.week}: ${d.avgValue != null ? d.avgValue : "—"}`}
            />
            <span className="text-[9px] text-gray-400">W{d.week}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TrendsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance/trends")
      .then(r => r.json())
      .then(j => {
        if (j.success) setData(j.data);
        else setError(j.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <div className="p-6 text-xs text-red-600">Error: {error}</div>;
  if (!data) return null;

  const quarterlyData: any[] = data.quarterlyData || [];
  const weeklyTrend: any[] = data.weeklyTrend || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-sm font-semibold text-gray-900">Performance Trends</h1>
        <p className="text-xs text-gray-500 mt-0.5">Quarter-over-quarter and weekly KPI trends</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
        {/* Quarterly bar chart */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />Quarterly Comparison
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500 rounded-sm inline-block" />KPI Attainment</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-purple-400 rounded-sm inline-block" />Priority Rate</span>
            </div>
          </div>
          <CSSBarChart data={quarterlyData} />
        </div>

        {/* Quarterly table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-700">Quarter-by-Quarter Breakdown</h2>
          </div>
          <table className="border-separate border-spacing-0 text-xs w-full">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                {["Quarter", "Year", "KPI Count", "KPI Attainment", "Priority Count", "Priority Rate"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {quarterlyData.map(q => (
                <tr key={q.label} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 font-medium text-gray-800">{q.quarter}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{q.year}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600 text-center">{q.kpiCount}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100">
                    {q.kpiAttainment != null ? (
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${q.kpiAttainment >= 80 ? "bg-green-100 text-green-700" : q.kpiAttainment >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{q.kpiAttainment}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600 text-center">{q.priorityCount}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100">
                    {q.priorityRate != null ? (
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${q.priorityRate >= 80 ? "bg-green-100 text-green-700" : q.priorityRate >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{q.priorityRate}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Current quarter weekly */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-700 mb-4 flex items-center gap-1.5">
            <LineChart className="h-3.5 w-3.5 text-blue-500" />Current Quarter — Weekly KPI Average
          </h2>
          {weeklyTrend.every(w => w.avgValue === null) ? (
            <div className="py-8 text-center text-xs text-gray-400">No weekly data available for current quarter</div>
          ) : (
            <CSSLineChart data={weeklyTrend} />
          )}
        </div>
      </div>
    </div>
  );
}
