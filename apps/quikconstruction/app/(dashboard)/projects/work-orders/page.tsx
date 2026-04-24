"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Briefcase, ArrowLeft, Send, CheckCircle, Trash2, Eye } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Wo {
  id: string; woNumber: string; woDate: string; status: string;
  totalAmount: string;
  project: { name: string; code: string } | null;
  contractor: { name: string } | null;
  workCategory: { name: string } | null;
}
interface Opt { id: string; name: string; code?: string }

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700", completed: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700", cancelled: "bg-red-100 text-red-700",
};

export default function WoListPage() {
  const [items, setItems] = useState<Wo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [contractors, setContractors] = useState<Opt[]>([]);
  const [workCats, setWorkCats] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/work-orders"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/contractors").then(r => r.json()).then(j => j.success && setContractors(j.data));
    fetch("/api/masters/work-categories").then(r => r.json()).then(j => j.success && setWorkCats(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, [refresh]);

  async function send(w: Wo) {
    const ok = await confirm({ title: "Send WO to contractor?", description: w.woNumber, confirmLabel: "Send", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/work-orders/${w.id}/send`, { method: "POST" }); refresh();
  }
  async function complete(w: Wo) {
    const ok = await confirm({ title: "Mark WO complete?", description: w.woNumber, confirmLabel: "Complete", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/work-orders/${w.id}/complete`, { method: "POST" }); refresh();
  }
  async function remove(w: Wo) {
    const ok = await confirm({ title: "Delete draft WO?", description: w.woNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/work-orders/${w.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Work Orders</h1>
          <p className="text-xs text-gray-500">Sub-contract scope packages — contractor, project, per-line rates.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add WO</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Briefcase} title="No work orders yet" message="Issue the first work order to a contractor." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">WO #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Contractor</th><th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 120 }}></th>
            </tr></thead>
            <tbody>{items.map(w => (
              <tr key={w.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{w.woNumber}</td>
                <td className="px-3 py-2 text-gray-700">{w.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-gray-700">{w.contractor?.name ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{w.workCategory?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(w.woDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{w.totalAmount}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[w.status] ?? "bg-gray-100 text-gray-600"}`}>{w.status.replace(/_/g, " ")}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/projects/work-orders/${w.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {w.status === "draft" && <button onClick={() => send(w)} className="text-gray-400 hover:text-blue-600 p-1" title="Send"><Send className="h-3.5 w-3.5" /></button>}
                  {(w.status === "sent" || w.status === "in_progress") && <button onClick={() => complete(w)} className="text-gray-400 hover:text-green-600 p-1" title="Complete"><CheckCircle className="h-3.5 w-3.5" /></button>}
                  {w.status === "draft" && <button onClick={() => remove(w)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <MultiLineDocForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Work Order"
        endpoint="/api/projects/work-orders"
        onSaved={refresh}
        addLineLabel="Add Line"
        showTotal
        headerDefaults={{ woNumber: `WO-${Date.now().toString().slice(-6)}`, woDate: new Date().toISOString().slice(0, 10) }}
        lineDefault={{ itemId: "", description: "", quantity: null, uomId: "", rate: null, gstRate: null, remarks: "" }}
        headerFields={[
          { name: "woNumber", label: "WO #", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "woDate", label: "WO Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "contractorId", label: "Contractor", type: "select", required: true, width: "half", options: contractors.map(c => ({ value: c.id, label: c.name })) },
          { name: "workCategoryId", label: "Work Category", type: "select", width: "half", options: [{ value: "", label: "— none —" }, ...workCats.map(c => ({ value: c.id, label: c.name }))] },
          { name: "paymentTermsDays", label: "Payment Terms (days)", type: "number", integerOnly: true, min: 0, max: 365, width: "half" },
          { name: "startDate", label: "Start Date", type: "text", width: "half", placeholder: "YYYY-MM-DD" },
          { name: "endDate", label: "End Date", type: "text", width: "half", placeholder: "YYYY-MM-DD" },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "description", label: "Scope Description *", type: "text", required: true, width: 260 },
          { key: "quantity", label: "Qty", type: "number", required: true, width: 80, min: 0 },
          { key: "uomId", label: "UOM", type: "select", width: 80, options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "rate", label: "Rate", type: "number", required: true, width: 90, min: 0 },
          { key: "gstRate", label: "GST %", type: "number", width: 70, min: 0, max: 100 },
          {
            key: "amount", label: "Amount", type: "number", width: 100,
            compute: (l) => {
              const q = Number(l.quantity ?? 0); const r = Number(l.rate ?? 0); const g = Number(l.gstRate ?? 0);
              if (!q || !r) return null;
              return q * r * (1 + g / 100);
            },
          },
          { key: "remarks", label: "Remarks", type: "text", width: 110 },
        ] as LineColumn[]}
      />
    </div>
  );
}
