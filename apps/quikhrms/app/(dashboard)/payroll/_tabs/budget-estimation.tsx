"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { KPI } from "./_shared";
import { INR_LAKH } from "./_shared-constants";
import { useCompensationDetail, groupBy } from "./_data";

export default function BudgetEstimationTab() {
  const { data, isLoading } = useCompensationDetail();
  const rows = data?.data ?? [];

  const [globalHike, setGlobalHike] = useState(8);
  const [topPerformerBonus, setTopPerformerBonus] = useState(2);
  const [topPerformerPct, setTopPerformerPct] = useState(20);

  const deptGroups = useMemo(() => groupBy(rows, (r) => r.deptId ?? r.deptName), [rows]);
  const [deptOverrides, setDeptOverrides] = useState<Record<string, number>>({});

  const totals = useMemo(() => {
    const sortedByCtc = [...rows].sort((a, b) => b.ctc - a.ctc);
    const topCount = Math.ceil((rows.length * topPerformerPct) / 100);
    const topSet = new Set(sortedByCtc.slice(0, topCount).map((r) => r.employeeId));

    let current = 0;
    let projected = 0;
    for (const r of rows) {
      const baseHike = deptOverrides[r.deptId ?? r.deptName] ?? globalHike;
      const bonus = topSet.has(r.employeeId) ? topPerformerBonus : 0;
      const hike = baseHike + bonus;
      current += r.ctc;
      projected += r.ctc * (1 + hike / 100);
    }
    return { current, projected, delta: projected - current, perHead: rows.length ? (projected - current) / rows.length : 0 };
  }, [rows, globalHike, deptOverrides, topPerformerBonus, topPerformerPct]);

  if (isLoading) return <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-xs">Loading…</div>;
  if (rows.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPI label="Headcount" value={String(rows.length)} />
        <KPI label="Current Wage Bill" value={INR_LAKH(totals.current)} />
        <KPI label="Projected Wage Bill" value={INR_LAKH(totals.projected)} />
        <KPI label="Budget Impact" value={INR_LAKH(totals.delta)} hint={`${((totals.delta / totals.current) * 100 || 0).toFixed(2)}% · ${INR_LAKH(totals.perHead)}/head`} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-gray-800 mb-3">Scenario controls</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Company-wide hike %" value={globalHike} setValue={setGlobalHike} min={0} max={30} step={0.5} />
          <Slider label="Top performer bonus %" value={topPerformerBonus} setValue={setTopPerformerBonus} min={0} max={20} step={0.5} />
          <Slider label="Top performer cohort %" value={topPerformerPct} setValue={setTopPerformerPct} min={0} max={50} step={1} suffix="of workforce" />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-gray-800 mb-3">Department-level overrides</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-right px-4 py-2.5">Headcount</th>
                <th className="text-right px-4 py-2.5">Current Bill</th>
                <th className="text-right px-4 py-2.5">Hike %</th>
                <th className="text-right px-4 py-2.5">Projected Bill</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(deptGroups).map(([key, group]) => {
                const deptName = group[0].deptName;
                const current = group.reduce((s, r) => s + r.ctc, 0);
                const hike = deptOverrides[key] ?? globalHike;
                const projected = current * (1 + hike / 100);
                return (
                  <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[13px] font-medium text-gray-900">{deptName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{group.length}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{INR_LAKH(current)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        value={deptOverrides[key] ?? ""}
                        placeholder={String(globalHike)}
                        onChange={(e) =>
                          setDeptOverrides((p) => ({ ...p, [key]: e.target.value === "" ? globalHike : Number(e.target.value) }))
                        }
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded text-right"
                        step={0.5}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{INR_LAKH(projected)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, setValue, min, max, step, suffix }: {
  label: string; value: number; setValue: (n: number) => void; min: number; max: number; step: number; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <p className="text-sm font-semibold text-gray-900 tabular-nums">
          {value}% {suffix && <span className="text-[10px] text-gray-500 font-normal">{suffix}</span>}
        </p>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-[#166534]"
      />
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 flex flex-col items-center gap-2 text-gray-500">
      <AlertCircle size={28} className="text-gray-400" />
      <p className="text-sm font-semibold text-gray-700">No salary data to project from</p>
      <p className="text-xs text-gray-500">Assign at least one employee salary first.</p>
    </div>
  );
}
