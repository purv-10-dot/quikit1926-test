"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { KPI } from "./_shared";
import { INR_LAKH } from "./_shared-constants";
import { useCompensationDetail, groupBy, median } from "./_data";

type Filter = "all" | "underpaid" | "overpaid";

export default function EmployeeCompetitivenessTab() {
  const { data, isLoading } = useCompensationDetail();
  const rows = data?.data ?? [];

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // Median CTC by (designationName) — internal "market" benchmark.
  // With no external data source, peer-median acts as a proxy.
  const medianByDesignation = useMemo(() => {
    const grouped = groupBy(rows, (r) => r.designationName);
    const m: Record<string, number> = {};
    for (const [key, items] of Object.entries(grouped)) {
      m[key] = median(items.map((r) => r.ctc));
    }
    return m;
  }, [rows]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const peerMedian = medianByDesignation[r.designationName] || r.ctc;
      const deltaPct = peerMedian ? ((r.ctc - peerMedian) / peerMedian) * 100 : 0;
      let band: "underpaid" | "fair" | "overpaid";
      if (deltaPct < -10) band = "underpaid";
      else if (deltaPct > 10) band = "overpaid";
      else band = "fair";
      return { ...r, peerMedian, deltaPct, band };
    });
  }, [rows, medianByDesignation]);

  const counts = useMemo(() => ({
    total: enriched.length,
    underpaid: enriched.filter((r) => r.band === "underpaid").length,
    fair: enriched.filter((r) => r.band === "fair").length,
    overpaid: enriched.filter((r) => r.band === "overpaid").length,
  }), [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (filter !== "all" && r.band !== filter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.deltaPct - b.deltaPct);
  }, [enriched, filter, search]);

  if (isLoading) return <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-sm">Loading…</div>;
  if (rows.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPI label="Total Employees" value={String(counts.total)} />
        <KPI label="Underpaid (<-10%)" value={String(counts.underpaid)} hint="Below peer median" />
        <KPI label="Fair" value={String(counts.fair)} hint="Within ±10%" />
        <KPI label="Overpaid (>+10%)" value={String(counts.overpaid)} hint="Above peer median" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md w-64 focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          />
          <div className="flex gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5">
            {([
              { v: "all" as Filter, label: "All" },
              { v: "underpaid" as Filter, label: "Underpaid" },
              { v: "overpaid" as Filter, label: "Overpaid" },
            ]).map((b) => (
              <button
                key={b.v}
                type="button"
                onClick={() => setFilter(b.v)}
                className={`px-3 py-1 text-xs font-semibold rounded ${filter === b.v ? "bg-white text-[#16243A] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 ml-auto">Benchmark = internal peer median by designation</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Designation</th>
                <th className="text-right py-2 px-3">Current CTC</th>
                <th className="text-right py-2 px-3">Peer Median</th>
                <th className="text-right py-2 px-3">Delta %</th>
                <th className="text-left py-2 px-3">Band</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.salaryId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-[10px] text-gray-500">{r.code}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-700">{r.designationName}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{INR_LAKH(r.ctc)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700">{INR_LAKH(r.peerMedian)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${r.deltaPct < 0 ? "text-red-600" : r.deltaPct > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                    <span className="inline-flex items-center gap-1">
                      {r.deltaPct < 0 ? <TrendingDown size={12} /> : r.deltaPct > 0 ? <TrendingUp size={12} /> : null}
                      {r.deltaPct > 0 ? "+" : ""}{r.deltaPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <BandPill band={r.band} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400">No matches</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BandPill({ band }: { band: "underpaid" | "fair" | "overpaid" }) {
  const styles = {
    underpaid: "bg-red-50 text-red-700 ring-red-200",
    fair:      "bg-emerald-50 text-emerald-700 ring-emerald-200",
    overpaid:  "bg-amber-50 text-amber-700 ring-amber-200",
  } as const;
  const labels = { underpaid: "Underpaid", fair: "Fair", overpaid: "Overpaid" } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${styles[band]}`}>
      {band === "underpaid" && <AlertTriangle size={10} />}
      {labels[band]}
    </span>
  );
}

function Empty() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 flex flex-col items-center gap-2 text-gray-500">
      <AlertCircle size={28} className="text-gray-400" />
      <p className="text-sm font-semibold text-gray-700">No salaries to benchmark</p>
      <p className="text-xs text-gray-500">Assign salaries first.</p>
    </div>
  );
}
