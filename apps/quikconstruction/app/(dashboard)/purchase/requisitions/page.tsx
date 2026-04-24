"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { FileText, ArrowLeft, Send, Trash2, Eye } from "lucide-react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Pr {
  id: string;
  prNumber: string;
  status: string;
  requestDate: string;
  requiredDate: string | null;
  purpose: string | null;
  project: { id: string; name: string } | null;
  lines: Array<{ id: string; item: { code: string; name: string }; quantity: string; uom: { code: string } }>;
}

const STATUS_BADGE: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  converted: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-400 line-through",
};

interface Opt { id: string; name: string; code?: string }

export default function PrListPage() {
  const [items, setItems] = useState<Pr[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [items_, setItems_] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setItems_(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase/requisitions");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function submit(pr: Pr) {
    const ok = await confirm({
      title: "Submit this PR?",
      description: `"${pr.prNumber}" will move to 'submitted'. You won't be able to edit it.`,
      confirmLabel: "Submit",
      tone: "default",
    });
    if (!ok) return;
    await fetch(`/api/purchase/requisitions/${pr.id}/submit`, { method: "POST" });
    refresh();
  }

  async function remove(pr: Pr) {
    const ok = await confirm({
      title: "Delete this draft PR?",
      description: `"${pr.prNumber}" will be archived.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    await fetch(`/api/purchase/requisitions/${pr.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/purchase" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Purchase
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Purchase Requisitions</h1>
          <p className="text-xs text-gray-500">Multi-line create UI ships in Phase 3b — for now POST to <code className="bg-gray-100 px-1 rounded">/api/purchase/requisitions</code> with body <code className="bg-gray-100 px-1 rounded">{`{prNumber, projectId, requestedById, requestDate, lines:[...]}`}</code>.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add PR</AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="No requisitions yet" message="Create your first PR — header + line items." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">PR #</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Lines</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((pr) => (
                <tr key={pr.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900">{pr.prNumber}</td>
                  <td className="px-3 py-2 text-gray-700">{pr.project?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(pr.requestDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-gray-700">{pr.lines.length}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[pr.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {pr.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/purchase/requisitions/${pr.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block" title="View"><Eye className="h-3.5 w-3.5" /></Link>
                    {pr.status === "draft" && (
                      <>
                        <button onClick={() => submit(pr)} className="text-gray-400 hover:text-accent-600 p-1" title="Submit">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(pr)} className="text-gray-400 hover:text-red-600 p-1" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MultiLineDocForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Purchase Requisition"
        endpoint="/api/purchase/requisitions"
        onSaved={refresh}
        addLineLabel="Add Item"
        headerDefaults={{
          prNumber: `PR-${Date.now().toString().slice(-6)}`,
          requestDate: new Date().toISOString().slice(0, 10),
        }}
        lineDefault={{ itemId: "", quantity: null, uomId: "", estimatedRate: null, remarks: "" }}
        headerFields={[
          { name: "prNumber", label: "PR Number", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "requestDate", label: "Request Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half",
            options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "requestedById", label: "Requested By (user id)", type: "text", required: true, width: "half",
            hint: "Paste a user id — picker coming in Phase 3c" },
          { name: "requiredDate", label: "Required By", type: "text", width: "half", placeholder: "YYYY-MM-DD" },
          { name: "purpose", label: "Purpose", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "itemId", label: "Item", type: "select", required: true, width: 220,
            options: items_.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` })) },
          { key: "quantity", label: "Qty", type: "number", required: true, width: 90, min: 0 },
          { key: "uomId", label: "UOM", type: "select", required: true, width: 100,
            options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "estimatedRate", label: "Est. Rate", type: "number", width: 100, min: 0 },
          { key: "remarks", label: "Remarks", type: "text", width: 140 },
        ] as LineColumn[]}
      />
    </div>
  );
}
