"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { ShieldCheck, Eye, Trash2, Plus } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { UserPicker } from "@/components/ui/UserPicker";

interface Insp { id: string; inspectionNumber: string; inspectionDate: string; decision: string; inspectorId: string; grn: { grnNumber: string } | null; project: { name: string } | null; _count: { defects: number } }
interface Grn { id: string; grnNumber: string }
interface Project { id: string; name: string }

const BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700", accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700", conditional: "bg-blue-100 text-blue-700",
};

type Defect = { defectType: string; severity: "minor" | "major" | "critical"; quantity: number | null; remarks: string };

export default function QualityPage() {
  const [items, setItems] = useState<Insp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [grns, setGrns] = useState<Grn[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ inspectionNumber: "", grnId: "", projectId: "", inspectorId: "", inspectionDate: new Date().toISOString().slice(0, 10), decision: "pending", remarks: "" });
  const [defects, setDefects] = useState<Defect[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/quality/inspections"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  function openNew() {
    setForm({ inspectionNumber: `QC-${Date.now().toString().slice(-6)}`, grnId: "", projectId: "", inspectorId: "", inspectionDate: new Date().toISOString().slice(0, 10), decision: "pending", remarks: "" });
    setDefects([]);
    setErr(null); setOpen(true);
    Promise.all([
      fetch("/api/store/grn").then(r => r.json()),
      fetch("/api/masters/projects").then(r => r.json()),
    ]).then(([g, p]) => {
      if (g.success) setGrns(g.data);
      if (p.success) setProjects(p.data);
    });
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = {
        ...form,
        grnId: form.grnId || null, projectId: form.projectId || null,
        defects: defects.filter(d => d.defectType),
      };
      const r = await fetch("/api/quality/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Quality Control</h1>
      <p className="text-sm text-gray-500 mb-4">Inspections and defect logs — typically against a GRN.</p>
      <div className="flex justify-end mb-4"><AddButton onClick={openNew}>Add Inspection</AddButton></div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No inspections yet" message="Log quality checks on received goods or site work." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Inspection #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">GRN</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-right px-3 py-2">Defects</th><th className="text-left px-3 py-2">Decision</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{items.map(i => (
              <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{i.inspectionNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(i.inspectionDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 font-mono text-xs text-accent-700">{i.grn?.grnNumber ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{i.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{i._count.defects}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[i.decision] ?? "bg-gray-100 text-gray-600"}`}>{i.decision}</span></td>
                <td className="px-3 py-2"><Link href={`/quality/inspections/${i.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Add Inspection"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Header">
            <FormRow cols={2}>
              <Field label="Inspection #" required><Input value={form.inspectionNumber} onChange={e => setForm({ ...form, inspectionNumber: e.target.value.toUpperCase() })} /></Field>
              <Field label="Date" required><Input type="date" value={form.inspectionDate} onChange={e => setForm({ ...form, inspectionDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="GRN"><Select value={form.grnId} onChange={e => setForm({ ...form, grnId: e.target.value })} options={grns.map(g => ({ value: g.id, label: g.grnNumber }))} placeholder="— none —" /></Field>
              <Field label="Project"><Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— none —" /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Inspector" required>
                <UserPicker value={form.inspectorId} onChange={(uid) => setForm({ ...form, inspectorId: uid })} />
              </Field>
              <Field label="Decision"><Select value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} options={[{ value: "pending", label: "Pending" }, { value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "conditional", label: "Conditional" }]} /></Field>
            </FormRow>
            <Field label="Remarks"><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></Field>
          </FormSection>
          <FormSection title={`Defects (${defects.length})`}>
            <div className="space-y-1">
              {defects.map((d, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <input placeholder="Defect type" value={d.defectType} onChange={e => setDefects(prev => prev.map((x, idx) => idx === i ? { ...x, defectType: e.target.value } : x))} className="flex-1 border border-gray-300 rounded px-2 py-1" />
                  <select value={d.severity} onChange={e => setDefects(prev => prev.map((x, idx) => idx === i ? { ...x, severity: e.target.value as Defect["severity"] } : x))} className="border border-gray-300 rounded px-2 py-1">
                    <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
                  </select>
                  <input type="number" placeholder="Qty" value={d.quantity ?? ""} onChange={e => setDefects(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: e.target.value ? Number(e.target.value) : null } : x))} className="w-20 border border-gray-300 rounded px-2 py-1" />
                  <input placeholder="Remarks" value={d.remarks} onChange={e => setDefects(prev => prev.map((x, idx) => idx === i ? { ...x, remarks: e.target.value } : x))} className="flex-1 border border-gray-300 rounded px-2 py-1" />
                  <button onClick={() => setDefects(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <button onClick={() => setDefects(prev => [...prev, { defectType: "", severity: "minor", quantity: null, remarks: "" }])} className="text-xs text-accent-700 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add defect</button>
            </div>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
