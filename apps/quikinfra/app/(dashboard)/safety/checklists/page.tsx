"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { ClipboardCheck, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Checklist { id: string; templateName: string; checklistDate: string; overallStatus: string; completedBy: string; project: { name: string } | null; items: Array<{ item: string; ok: boolean; remarks?: string }> }
interface Project { id: string; name: string }

const STATUS: Record<string, string> = { pass: "bg-green-100 text-green-700", partial: "bg-amber-100 text-amber-700", fail: "bg-red-100 text-red-700" };

type Item = { item: string; ok: boolean; remarks: string };

export default function ChecklistsPage() {
  const [items, setItems] = useState<Checklist[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ templateName: "Daily site safety walk", checklistDate: new Date().toISOString().slice(0, 10), projectId: "", completedBy: "", remarks: "" });
  const [rows, setRows] = useState<Item[]>([
    { item: "PPE in use", ok: true, remarks: "" },
    { item: "Fire extinguishers available", ok: true, remarks: "" },
    { item: "First aid kit stocked", ok: true, remarks: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/safety/checklists"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data)); }, [refresh]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, projectId: form.projectId || null, items: rows.filter(r => r.item) };
      const r = await fetch("/api/safety/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/safety" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Safety</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Checklists</h1><p className="text-xs text-gray-500">Daily walk / site audit templates.</p></div>
        <AddButton onClick={() => setOpen(true)}>New Checklist</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No checklists yet" message="Run a daily site safety walk." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Template</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">Completed By</th>
              <th className="text-right px-3 py-2">Items</th><th className="text-left px-3 py-2">Overall</th>
            </tr></thead>
            <tbody>{items.map(c => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">{c.templateName}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(c.checklistDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono">{c.completedBy}</td>
                <td className="px-3 py-2 text-right text-gray-700">{c.items.length}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS[c.overallStatus]}`}>{c.overallStatus}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="New Checklist"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Header">
            <FormRow cols={2}>
              <Field label="Template" required><Input value={form.templateName} onChange={e => setForm({ ...form, templateName: e.target.value })} /></Field>
              <Field label="Date" required><Input type="date" value={form.checklistDate} onChange={e => setForm({ ...form, checklistDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Project"><Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— none —" /></Field>
              <Field label="Completed By" required><Input value={form.completedBy} onChange={e => setForm({ ...form, completedBy: e.target.value })} /></Field>
            </FormRow>
          </FormSection>
          <FormSection title="Items">
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <input value={r.item} onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, item: e.target.value } : x))} className="flex-1 border border-gray-300 rounded px-2 py-1" placeholder="Item" />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={r.ok} onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, ok: e.target.checked } : x))} /> OK
                  </label>
                  <input value={r.remarks} onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, remarks: e.target.value } : x))} className="flex-1 border border-gray-300 rounded px-2 py-1" placeholder="Remarks" />
                  <button onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <button onClick={() => setRows(prev => [...prev, { item: "", ok: true, remarks: "" }])} className="text-xs text-accent-700 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add item</button>
            </div>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
