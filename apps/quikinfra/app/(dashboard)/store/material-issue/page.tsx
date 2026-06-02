"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { PackageMinus, ArrowLeft, CheckCircle, Trash2, Eye } from "lucide-react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Opt { id: string; name: string; code?: string }

interface Mi {
  id: string;
  issueNumber: string;
  issueDate: string;
  status: string;
  purpose: string | null;
  project: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft:  "bg-gray-100 text-gray-600",
  posted: "bg-green-100 text-green-700",
};

export default function MiListPage() {
  const [items, setItems] = useState<Mi[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [items_, setItems_] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setItems_(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/material-issue");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function post(mi: Mi) {
    const ok = await confirm({
      title: "Post this issue?",
      description: `"${mi.issueNumber}" will write NEGATIVE rows to the stock ledger. Pre-checked for sufficient stock at the issue location.`,
      confirmLabel: "Post",
      tone: "default",
    });
    if (!ok) return;
    const res = await fetch(`/api/store/material-issue/${mi.id}/post`, { method: "POST" });
    const j = await res.json();
    if (!j.success) {
      alert(`Posting failed: ${j.error}\n${j.details ? JSON.stringify(j.details, null, 2) : ""}`);
    }
    refresh();
  }

  async function remove(mi: Mi) {
    const ok = await confirm({ title: "Delete this draft issue?", description: `"${mi.issueNumber}" will be archived.`, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/store/material-issue/${mi.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/store" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Store
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Material Issue</h1>
          <p className="text-xs text-gray-500">Issues to site/project. Pre-checks available stock before posting.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add Issue</AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={PackageMinus} title="No material issues yet" message="Issue stock to project sites via this module." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Issue #</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Purpose</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((mi) => (
                <tr key={mi.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900">{mi.issueNumber}</td>
                  <td className="px-3 py-2 text-gray-700">{mi.project?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{mi.location?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(mi.issueDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{mi.purpose ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[mi.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {mi.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/store/material-issue/${mi.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block" title="View"><Eye className="h-3.5 w-3.5" /></Link>
                    {mi.status === "draft" && <>
                      <button onClick={() => post(mi)} className="text-gray-400 hover:text-green-600 p-1" title="Post"><CheckCircle className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(mi)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>}
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
        title="Material Issue"
        endpoint="/api/store/material-issue"
        onSaved={refresh}
        addLineLabel="Add Item"
        headerDefaults={{
          issueNumber: `MI-${Date.now().toString().slice(-6)}`,
          issueDate: new Date().toISOString().slice(0, 10),
        }}
        lineDefault={{ itemId: "", issuedQty: null, uomId: "", unitRate: null, remarks: "" }}
        headerFields={[
          { name: "issueNumber", label: "Issue Number", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "issueDate", label: "Issue Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half",
            options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "locationId", label: "Location", type: "select", required: true, width: "half",
            options: locations.map(l => ({ value: l.id, label: l.name })) },
          { name: "issuedToId", label: "Issued To (user id)", type: "text", required: true, width: "half" },
          { name: "issuedById", label: "Issued By (user id)", type: "text", required: true, width: "half" },
          { name: "purpose", label: "Purpose", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "itemId", label: "Item", type: "select", required: true, width: 220,
            options: items_.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` })) },
          { key: "issuedQty", label: "Qty", type: "number", required: true, width: 90, min: 0 },
          { key: "uomId", label: "UOM", type: "select", required: true, width: 100,
            options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "unitRate", label: "Rate", type: "number", required: true, width: 100, min: 0 },
          { key: "remarks", label: "Remarks", type: "text", width: 140 },
        ] as LineColumn[]}
      />
    </div>
  );
}
