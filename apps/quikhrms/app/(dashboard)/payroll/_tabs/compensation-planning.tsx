"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { KPI } from "./_shared";
import { INR_LAKH } from "./_shared-constants";
import { useCompensationDetail } from "./_data";

export default function CompensationPlanningTab() {
  const { data, isLoading } = useCompensationDetail();
  const rows = data?.data ?? [];

  const [hikes, setHikes] = useState<Record<string, number>>({});
  const [globalHike, setGlobalHike] = useState<number>(0);
  const [search, setSearch] = useState("");

  const effHike = (id: string) => (hikes[id] ?? globalHike);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const totals = useMemo(() => {
    let currentTotal = 0;
    let newTotal = 0;
    for (const r of rows) {
      currentTotal += r.ctc;
      newTotal += r.ctc * (1 + effHike(r.employeeId) / 100);
    }
    return { currentTotal, newTotal, delta: newTotal - currentTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hikes, globalHike]);

  if (isLoading) return <Loading />;
  if (rows.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="Current Wage Bill" value={INR_LAKH(totals.currentTotal)} />
        <KPI label="Projected Wage Bill" value={INR_LAKH(totals.newTotal)} />
        <KPI label="Net Increase" value={INR_LAKH(totals.delta)} hint={`${((totals.delta / totals.currentTotal) * 100 || 0).toFixed(2)}% over current`} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md w-64 focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Apply hike % to all:
            <input
              type="number"
              value={globalHike}
              onChange={(e) => setGlobalHike(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-gray-200 rounded-md"
              min={-50}
              max={200}
              step={0.5}
            />
            <span className="text-xs text-gray-500">%</span>
          </label>
          <button
            type="button"
            onClick={() => setHikes({})}
            className="text-xs font-semibold text-[#22c55e] hover:underline"
          >
            Reset overrides
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5">Designation</th>
                <th className="text-right px-4 py-2.5">Current CTC</th>
                <th className="text-right px-4 py-2.5">Hike %</th>
                <th className="text-right px-4 py-2.5">New CTC</th>
                <th className="text-right px-4 py-2.5">Delta</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const hike = effHike(r.employeeId);
                const newCtc = r.ctc * (1 + hike / 100);
                const delta = newCtc - r.ctc;
                return (
                  <tr key={r.salaryId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-gray-900">{r.name}</p>
                      <p className="text-[10px] text-gray-500">{r.code}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{r.deptName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{r.designationName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{INR_LAKH(r.ctc)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        value={hikes[r.employeeId] ?? ""}
                        placeholder={String(globalHike)}
                        onChange={(e) =>
                          setHikes((p) => ({ ...p, [r.employeeId]: e.target.value === "" ? globalHike : Number(e.target.value) }))
                        }
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded text-right"
                        step={0.5}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{INR_LAKH(newCtc)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-gray-400"}`}>
                      {delta > 0 ? "+" : ""}{INR_LAKH(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400 mt-3">
          Planning is local-only. Use Payroll → Salary Revisions to push approved hikes.
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-xs">Loading…</div>
  );
}

function Empty() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 flex flex-col items-center gap-2 text-gray-500">
      <AlertCircle size={28} className="text-gray-400" />
      <p className="text-sm font-semibold text-gray-700">No employee salaries assigned</p>
      <p className="text-xs text-gray-500">Assign salaries first under Payroll → Employee Salaries.</p>
    </div>
  );
}

