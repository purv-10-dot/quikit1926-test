"use client";

import { useMemo } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { KPI } from "./_shared";
import { INR_LAKH } from "./_shared-constants";
import { useCompensationDetail, groupBy, median } from "./_data";

export default function GeographicalDifferentialsTab() {
  const { data, isLoading } = useCompensationDetail();
  const rows = data?.data ?? [];

  const stats = useMemo(() => {
    const companyAvg = rows.length ? rows.reduce((s, r) => s + r.ctc, 0) / rows.length : 0;
    const companyMedian = median(rows.map((r) => r.ctc));

    const byLoc = groupBy(rows, (r) => r.locationName || "Unassigned");
    const locations = Object.entries(byLoc).map(([name, items]) => {
      const total = items.reduce((s, r) => s + r.ctc, 0);
      const avg = items.length ? total / items.length : 0;
      const med = median(items.map((r) => r.ctc));
      const diffFromCompany = companyAvg ? ((avg - companyAvg) / companyAvg) * 100 : 0;
      const minCtc = Math.min(...items.map((r) => r.ctc));
      const maxCtc = Math.max(...items.map((r) => r.ctc));
      return {
        name,
        headcount: items.length,
        total,
        avg,
        median: med,
        diffFromCompany,
        minCtc,
        maxCtc,
      };
    }).sort((a, b) => b.avg - a.avg);

    return { companyAvg, companyMedian, locations, headcount: rows.length };
  }, [rows]);

  if (isLoading) return <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-xs">Loading…</div>;
  if (rows.length === 0) return <Empty />;

  const maxAvg = Math.max(...stats.locations.map((l) => l.avg), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="Locations" value={String(stats.locations.length)} />
        <KPI label="Company Avg CTC" value={INR_LAKH(stats.companyAvg)} hint={`Median ${INR_LAKH(stats.companyMedian)}`} />
        <KPI label="Headcount" value={String(stats.headcount)} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-gray-800 mb-3">Location-wise breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5">Location</th>
                <th className="text-right px-4 py-2.5">Headcount</th>
                <th className="text-right px-4 py-2.5">Avg CTC</th>
                <th className="text-right px-4 py-2.5">Median</th>
                <th className="text-right px-4 py-2.5">Min — Max</th>
                <th className="text-right px-4 py-2.5">vs Company Avg</th>
                <th className="text-left px-4 py-2.5 w-40">Avg vs Top</th>
              </tr>
            </thead>
            <tbody>
              {stats.locations.map((l) => {
                const bar = (l.avg / maxAvg) * 100;
                const diffColor = l.diffFromCompany > 5
                  ? "text-emerald-600"
                  : l.diffFromCompany < -5
                  ? "text-red-600"
                  : "text-gray-500";
                return (
                  <tr key={l.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-900">
                        <MapPin size={11} className="text-gray-400" /> {l.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{l.headcount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{INR_LAKH(l.avg)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{INR_LAKH(l.median)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 text-xs">
                      {INR_LAKH(l.minCtc)} — {INR_LAKH(l.maxCtc)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${diffColor}`}>
                      {l.diffFromCompany > 0 ? "+" : ""}{l.diffFromCompany.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-36 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${bar}%`, background: "#22c55e" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Use this to spot location-based pay gaps. To roll out city-tier COLA bands, configure office locations + grade-based pay ranges.
        </p>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 flex flex-col items-center gap-2 text-gray-500">
      <AlertCircle size={28} className="text-gray-400" />
      <p className="text-sm font-semibold text-gray-700">No location data</p>
      <p className="text-xs text-gray-500">Assign salaries and link employees to office locations.</p>
    </div>
  );
}
