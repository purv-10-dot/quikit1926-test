"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Clipboard, ArrowLeft, Trash2, Eye } from "lucide-react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Ind { id: string; indentNumber: string; requestDate: string; status: string; project: { name: string } | null; lines: Array<{ id: string }> }
interface Opt { id: string; name: string; code?: string }

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", converted: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-400 line-through",
};

export default function IndentListPage() {
  const [items, setItems] = useState<Ind[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [its, setIts] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/purchase/indents"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setIts(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, [refresh]);

  async function remove(ind: Ind) {
    const ok = await confirm({ title: "Delete this draft indent?", description: ind.indentNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/purchase/indents/${ind.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/purchase" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Purchase</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Purchase Indents</h1>
          <p className="text-xs text-gray-500">Between PR and PO — approvers consolidate requests.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add Indent</AddButton>
      </div>
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : items.length === 0 ? (
        <EmptyState icon={Clipboard} title="No indents yet" message="Create the first indent." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Indent #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Lines</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>{items.map(i => (
              <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{i.indentNumber}</td>
                <td className="px-3 py-2 text-gray-700">{i.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(i.requestDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">{i.lines.length}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[i.status] ?? "bg-gray-100 text-gray-600"}`}>{i.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><Link href={`/purchase/indents/${i.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>{i.status === "draft" && <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <MultiLineDocForm open={formOpen} onClose={() => setFormOpen(false)} title="Indent" endpoint="/api/purchase/indents"
        onSaved={refresh} addLineLabel="Add Item"
        headerDefaults={{ indentNumber: `IND-${Date.now().toString().slice(-6)}`, requestDate: new Date().toISOString().slice(0, 10) }}
        lineDefault={{ itemId: "", quantity: null, uomId: "", estimatedRate: null, remarks: "" }}
        headerFields={[
          { name: "indentNumber", label: "Indent #", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "requestDate", label: "Request Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "requestedById", label: "Requested By (user id)", type: "text", required: true, width: "half" },
          { name: "purpose", label: "Purpose", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "itemId", label: "Item", type: "select", required: true, width: 220, options: its.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` })) },
          { key: "quantity", label: "Qty", type: "number", required: true, width: 90, min: 0 },
          { key: "uomId", label: "UOM", type: "select", required: true, width: 100, options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "estimatedRate", label: "Est. Rate", type: "number", width: 100 },
          { key: "remarks", label: "Remarks", type: "text", width: 140 },
        ] as LineColumn[]}
      />
    </div>
  );
}
