"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Defect { id: string; defectType: string; severity: string; quantity: string | null; remarks: string | null; item: { code: string; name: string } | null; }
interface Insp { id: string; inspectionNumber: string; inspectionDate: string; decision: string; inspectorId: string; remarks: string | null; grn: { id: string; grnNumber: string } | null; project: { id: string; name: string } | null; defects: Defect[] }

const SEV: Record<string, string> = { minor: "bg-gray-100 text-gray-700", major: "bg-amber-100 text-amber-700", critical: "bg-red-100 text-red-700" };

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const [insp, setInsp] = useState<Insp | null>(null);
  const refresh = useCallback(() => { fetch(`/api/quality/inspections/${id}`).then(r => r.json()).then(j => j.success && setInsp(j.data)); }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!insp) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const meta = [
    { label: "Inspection #", value: insp.inspectionNumber },
    { label: "Date", value: new Date(insp.inspectionDate).toISOString().slice(0, 10) },
    { label: "Inspector", value: insp.inspectorId },
    { label: "Decision", value: insp.decision },
    { label: "GRN", value: insp.grn?.grnNumber ?? "—" },
    { label: "Project", value: insp.project?.name ?? "—" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/quality" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Quality</Link>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">{insp.inspectionNumber}</h1>
      {insp.remarks && <p className="text-xs text-gray-600 mb-5">{insp.remarks}</p>}
      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-100">
          {meta.map((m, i) => (
            <div key={i} className="p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div><div className="text-sm text-gray-900 mt-0.5 break-words">{m.value}</div></div>
          ))}
        </div>
      </section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Defects ({insp.defects.length})</h2>
      {insp.defects.length === 0 ? <div className="text-xs text-gray-500">No defects logged.</div> : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Defect</th><th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Severity</th><th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">Remarks</th>
            </tr></thead>
            <tbody>{insp.defects.map(d => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{d.defectType}</td>
                <td className="px-3 py-2 text-xs">{d.item ? `${d.item.code} — ${d.item.name}` : "—"}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${SEV[d.severity] ?? "bg-gray-100 text-gray-700"}`}>{d.severity}</span></td>
                <td className="px-3 py-2 text-right">{d.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{d.remarks ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
