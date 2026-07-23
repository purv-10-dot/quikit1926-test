"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { INR_LAKH } from "./_shared-constants";
import { useCompensationDetail, groupBy } from "./_data";

type Dim = "deptName" | "designationName" | "locationName" | "gradeName";

const DIM_LABELS: Record<Dim, string> = {
  deptName: "Department",
  designationName: "Designation",
  locationName: "Location",
  gradeName: "Grade",
};

export default function CompareCompensationTab() {
  const { data, isLoading } = useCompensationDetail();
  const rows = data?.data ?? [];

  const [groupDim, setGroupDim] = useState<Dim>("deptName");

  const buckets = useMemo(() => {
    const grouped = groupBy(rows, (r) => (r[groupDim] as string) || "Unassigned");
    const arr = Object.entries(grouped).map(([name, items]) => {
      const total = items.reduce((s, r) => s + r.ctc, 0);
      const avg = items.length ? total / items.length : 0;
      return { name, headcount: items.length, total, avg };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [rows, groupDim]);

  const grandTotal = useMemo(() => buckets.reduce((s, b) => s + b.total, 0), [buckets]);
  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);

  if (isLoading) return <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-xs">Loading…</div>;
  if (rows.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-[13px] font-semibold text-gray-800">Cost by {DIM_LABELS[groupDim]}</h3>
          <div className="flex gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5">
            {(Object.keys(DIM_LABELS) as Dim[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setGroupDim(d)}
                className={`px-3 py-1 text-xs font-semibold rounded ${groupDim === d ? "bg-white text-[#166534] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {DIM_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5">{DIM_LABELS[groupDim]}</th>
                <th className="text-right px-4 py-2.5">Headcount</th>
                <th className="text-right px-4 py-2.5">Avg CTC</th>
                <th className="text-right px-4 py-2.5">Total Cost</th>
                <th className="text-right px-4 py-2.5">% of Bill</th>
                <th className="text-left px-4 py-2.5 w-40">Share</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => {
                const pct = grandTotal ? (b.total / grandTotal) * 100 : 0;
                const barPct = (b.total / maxTotal) * 100;
                return (
                  <tr key={b.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[13px] font-medium text-gray-900">{b.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{b.headcount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{INR_LAKH(b.avg)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{INR_LAKH(b.total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{pct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      <div className="w-36 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: "#166534" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-gray-800">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{rows.length}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{INR_LAKH(grandTotal / Math.max(rows.length, 1))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{INR_LAKH(grandTotal)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 px-1">
        Year-over-year comparison requires historical pay runs. Once enough months exist, this view will diff current vs prior cycle.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 flex flex-col items-center gap-2 text-gray-500">
      <AlertCircle size={28} className="text-gray-400" />
      <p className="text-sm font-semibold text-gray-700">Nothing to compare yet</p>
      <p className="text-xs text-gray-500">Assign salaries first to see cross-cuts.</p>
    </div>
  );
}
