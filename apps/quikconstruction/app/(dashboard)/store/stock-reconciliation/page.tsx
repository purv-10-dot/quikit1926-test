"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Scale, ArrowLeft, CheckCircle, Trash2, Eye } from "lucide-react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Rec { id: string; reconciliationNumber: string; reconciliationDate: string; status: string;
  project: { name: string } | null; location: { name: string } | null; }
interface Opt { id: string; name: string; code?: string }

export default function ReconPage() {
  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [its, setIts] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/store/stock-reconciliation"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setIts(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, [refresh]);

  async function post(r: Rec) {
    const ok = await confirm({ title: "Post reconciliation?", description: "Writes adjustment rows to ledger (shortage checked).", confirmLabel: "Post", tone: "default" });
    if (!ok) return;
    const res = await fetch(`/api/store/stock-reconciliation/${r.id}/post`, { method: "POST" });
    const j = await res.json(); if (!j.success) alert(`Post failed: ${j.error}\n${JSON.stringify(j.details ?? "")}`); refresh();
  }
  async function remove(r: Rec) {
    const ok = await confirm({ title: "Delete draft?", description: r.reconciliationNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/store/stock-reconciliation/${r.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/store" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Store</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Stock Reconciliation</h1>
          <p className="text-xs text-gray-500">Physical count vs system. Posts adjustment_+/- rows on post.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add Reconciliation</AddButton>
      </div>
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : items.length === 0 ? (
        <EmptyState icon={Scale} title="No reconciliations yet" message="Count physical stock and adjust." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Recon #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Location</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.reconciliationNumber}</td>
                <td className="px-3 py-2 text-gray-700">{r.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-gray-700">{r.location?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.reconciliationDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.status === "posted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><Link href={`/store/stock-reconciliation/${r.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>{r.status === "draft" && <>
                  <button onClick={() => post(r)} className="text-gray-400 hover:text-green-600 p-1"><CheckCircle className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(r)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <MultiLineDocForm open={formOpen} onClose={() => setFormOpen(false)} title="Reconciliation" endpoint="/api/store/stock-reconciliation"
        onSaved={refresh} addLineLabel="Add Item"
        headerDefaults={{ reconciliationNumber: `RC-${Date.now().toString().slice(-6)}`, reconciliationDate: new Date().toISOString().slice(0, 10) }}
        lineDefault={{ itemId: "", systemQty: 0, physicalQty: 0, uomId: "", unitRate: 0, remarks: "" }}
        headerFields={[
          { name: "reconciliationNumber", label: "Recon #", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "reconciliationDate", label: "Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "locationId", label: "Location", type: "select", required: true, width: "half", options: locations.map(l => ({ value: l.id, label: l.name })) },
          { name: "reason", label: "Reason", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "itemId", label: "Item", type: "select", required: true, width: 200, options: its.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` })) },
          { key: "systemQty", label: "System Qty", type: "number", required: true, width: 90 },
          { key: "physicalQty", label: "Physical Qty", type: "number", required: true, width: 100 },
          { key: "uomId", label: "UOM", type: "select", required: true, width: 90, options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "unitRate", label: "Rate", type: "number", required: true, width: 90, min: 0 },
          { key: "remarks", label: "Remarks", type: "text", width: 130 },
        ] as LineColumn[]}
      />
    </div>
  );
}
