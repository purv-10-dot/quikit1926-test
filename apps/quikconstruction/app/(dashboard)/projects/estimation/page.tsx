"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Calculator, ArrowLeft, Trash2, Eye, ArrowRightLeft } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { EstimationFormPanel } from "./_components/EstimationFormPanel";

interface Est {
  id: string; estimationNumber: string; estimationDate: string; status: string;
  total: string; currency: string; convertedBoqId: string | null;
  project: { id: string; name: string; code: string } | null;
  _count: { items: number };
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", converted: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export default function EstimationListPage() {
  const [items, setItems] = useState<Est[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/estimation"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function convert(est: Est) {
    const boqNumber = prompt("New BOQ number:", `BOQ-${Date.now().toString().slice(-6)}`);
    if (!boqNumber) return;
    const boqDate = prompt("BOQ date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!boqDate) return;
    const ok = await confirm({ title: "Convert to BOQ?", description: `Clone "${est.estimationNumber}" into a new BOQ. Marks this estimation as converted.`, confirmLabel: "Convert", tone: "default" });
    if (!ok) return;
    const res = await fetch(`/api/projects/estimation/${est.id}/convert-to-boq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boqNumber, boqDate }),
    });
    const j = await res.json();
    if (!j.success) alert(`Convert failed: ${j.error}`);
    else window.location.href = `/projects/boq/${j.data.id}`;
  }

  async function remove(est: Est) {
    const ok = await confirm({ title: "Delete this estimation?", description: est.estimationNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/estimation/${est.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Estimations</h1>
          <p className="text-xs text-gray-500">Pre-BOQ cost estimates. Convert to BOQ once approved.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add Estimation</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Calculator} title="No estimations yet" message="Start by creating an initial cost estimate." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Est #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Items</th>
              <th className="text-right px-3 py-2">Total</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 110 }}></th>
            </tr></thead>
            <tbody>{items.map(e => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{e.estimationNumber}</td>
                <td className="px-3 py-2 text-gray-700">{e.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(e.estimationDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right">{e._count.items}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{e.total}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[e.status] ?? "bg-gray-100 text-gray-600"}`}>{e.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/projects/estimation/${e.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {e.status !== "converted" && e.status !== "rejected" && (
                    <button onClick={() => convert(e)} className="text-gray-400 hover:text-accent-600 p-1" title="Convert to BOQ"><ArrowRightLeft className="h-3.5 w-3.5" /></button>
                  )}
                  {e.status !== "converted" && (
                    <button onClick={() => remove(e)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <EstimationFormPanel open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  );
}
