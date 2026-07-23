"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface ChecklistItem { item?: string; acceptanceCriteria?: string }
interface Insp {
  id: string;
  inspectionNo: string;
  date: string;
  inspector: string | null;
  result: string | null;
  decision: string;
  status: string | null;
  category: string | null;
  checklistName: string | null;
  boqItem: string | null;
  projectId: string | null;
  remarks: string | null;
  items: ChecklistItem[];
}

const RESULT: Record<string, string> = {
  Pass: "bg-green-100 text-green-700",
  Fail: "bg-red-100 text-red-700",
  Conditional: "bg-amber-100 text-amber-700",
};

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const [insp, setInsp] = useState<Insp | null>(null);
  const refresh = useCallback(() => {
    fetch(`/api/quality/inspections/${id}`).then(r => r.json()).then(j => j.success && setInsp(j.data));
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!insp) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const items = Array.isArray(insp.items) ? insp.items : [];
  const meta = [
    { label: "Inspection #", value: insp.inspectionNo },
    { label: "Date", value: insp.date },
    { label: "Inspector", value: insp.inspector ?? "—" },
    { label: "Checklist", value: insp.checklistName ?? "—" },
    { label: "Category", value: insp.category ?? "—" },
    { label: "BOQ Item", value: insp.boqItem ?? "—" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/quality" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Quality</Link>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-lg font-semibold text-gray-900">{insp.inspectionNo}</h1>
        {insp.result && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RESULT[insp.result] ?? "bg-gray-100 text-gray-700"}`}>{insp.result}</span>
        )}
      </div>
      {insp.remarks && <p className="text-xs text-gray-600 mb-5">{insp.remarks}</p>}
      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-100">
          {meta.map((m, i) => (
            <div key={i} className="p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div><div className="text-sm text-gray-900 mt-0.5 break-words">{m.value}</div></div>
          ))}
        </div>
      </section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Checklist Items ({items.length})</h2>
      {items.length === 0 ? <div className="text-xs text-gray-500">No checklist items recorded.</div> : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Check Item</th>
              <th className="text-left px-3 py-2">Acceptance Criteria</th>
            </tr></thead>
            <tbody>{items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-2">{it.item ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{it.acceptanceCriteria ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
