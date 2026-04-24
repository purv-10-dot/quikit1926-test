"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { ClipboardList, ArrowLeft, Send, Trash2, Eye } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Dpr {
  id: string; dprDate: string; status: string; weather: string | null;
  project: { name: string; code: string } | null;
  _count: { lines: number };
}
interface Opt { id: string; name: string; code?: string; description?: string }

const BADGE: Record<string, string> = { draft: "bg-gray-100 text-gray-600", submitted: "bg-green-100 text-green-700" };

export default function DprListPage() {
  const [items, setItems] = useState<Dpr[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [boqItems, setBoqItems] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/dpr"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
    // Pull BOQ items (across all locked + draft BOQs) — users pick from this union
    fetch("/api/projects/boq").then(r => r.json()).then(async (j) => {
      if (!j.success) return;
      const all: Opt[] = [];
      for (const b of j.data) {
        const d = await fetch(`/api/projects/boq/${b.id}`).then(r => r.json());
        if (d.success) {
          for (const i of d.data.items) {
            if (i.kind === "item") all.push({ id: i.id, name: i.description, code: i.code ?? undefined });
          }
        }
      }
      setBoqItems(all);
    });
  }, [refresh]);

  async function submit(d: Dpr) {
    const ok = await confirm({ title: "Submit this DPR?", description: "Becomes immutable.", confirmLabel: "Submit", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/dpr/${d.id}/submit`, { method: "POST" }); refresh();
  }
  async function remove(d: Dpr) {
    const ok = await confirm({ title: "Delete draft DPR?", description: new Date(d.dprDate).toISOString().slice(0, 10), confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/dpr/${d.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Daily Progress Reports</h1>
          <p className="text-xs text-gray-500">One DPR per (project, date). Records work done, labour, machinery.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add DPR</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No DPRs yet" message="File the first daily report from site." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Weather</th><th className="text-right px-3 py-2">Activities</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 110 }}></th>
            </tr></thead>
            <tbody>{items.map(d => (
              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{new Date(d.dprDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-gray-700">{d.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{d.weather ?? "—"}</td>
                <td className="px-3 py-2 text-right">{d._count.lines}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[d.status] ?? "bg-gray-100 text-gray-600"}`}>{d.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/projects/dpr/${d.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {d.status === "draft" && <>
                    <button onClick={() => submit(d)} className="text-gray-400 hover:text-green-600 p-1" title="Submit"><Send className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(d)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <MultiLineDocForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="DPR"
        endpoint="/api/projects/dpr"
        onSaved={refresh}
        addLineLabel="Add Activity"
        headerDefaults={{ dprDate: new Date().toISOString().slice(0, 10) }}
        lineDefault={{ boqItemId: "", activity: "", quantityDone: null, uomId: "", labourCount: null, labourHours: null, machineryUsed: "", remarks: "" }}
        headerFields={[
          { name: "dprDate", label: "Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "weather", label: "Weather", type: "text", width: "half", placeholder: "Clear / Rain / …" },
          { name: "reportedById", label: "Reported By (user id)", type: "text", required: true, width: "half" },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "boqItemId", label: "BOQ Item", type: "select", width: 200, options: [{ value: "", label: "— free entry —" }, ...boqItems.map(b => ({ value: b.id, label: b.name }))] },
          { key: "activity", label: "Activity *", type: "text", required: true, width: 200 },
          { key: "quantityDone", label: "Qty Done", type: "number", required: true, width: 90, min: 0 },
          { key: "uomId", label: "UOM", type: "select", width: 80, options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "labourCount", label: "Labour #", type: "number", integerOnly: true, width: 80, min: 0 },
          { key: "labourHours", label: "Hours", type: "number", width: 80, min: 0 },
          { key: "machineryUsed", label: "Machinery", type: "text", width: 120 },
          { key: "remarks", label: "Remarks", type: "text", width: 120 },
        ] as LineColumn[]}
      />
    </div>
  );
}
