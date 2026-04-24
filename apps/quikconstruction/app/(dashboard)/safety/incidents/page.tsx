"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Textarea, Field, FormRow, FormSection } from "@quikit/ui";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { UserPicker } from "@/components/ui/UserPicker";

interface Inc {
  id: string; incidentNumber: string; incidentDate: string;
  category: string; severity: string; title: string; status: string;
  reportedBy: string; project: { name: string } | null;
}
interface Project { id: string; name: string }

const SEV: Record<string, string> = { low: "bg-gray-100 text-gray-700", medium: "bg-amber-100 text-amber-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const STATUS: Record<string, string> = { open: "bg-red-100 text-red-700", investigating: "bg-amber-100 text-amber-700", resolved: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-600" };

export default function IncidentsPage() {
  const [items, setItems] = useState<Inc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ incidentNumber: "", projectId: "", incidentDate: new Date().toISOString().slice(0, 10), category: "injury", severity: "low", title: "", description: "", reportedBy: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/safety/incidents"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data)); }, [refresh]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, projectId: form.projectId || null };
      const r = await fetch("/api/safety/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        <div><h1 className="text-lg font-semibold text-gray-900">Incidents</h1><p className="text-xs text-gray-500">Injuries, near-misses, damage, environmental.</p></div>
        <AddButton onClick={() => { setForm({ incidentNumber: `INC-${Date.now().toString().slice(-6)}`, projectId: "", incidentDate: new Date().toISOString().slice(0, 10), category: "injury", severity: "low", title: "", description: "", reportedBy: "" }); setErr(null); setOpen(true); }}>Log Incident</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents logged" message="Hopefully stays this way. Log anything that happens." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Incident #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Severity</th><th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr></thead>
            <tbody>{items.map(i => (
              <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{i.incidentNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(i.incidentDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{i.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{i.category}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${SEV[i.severity]}`}>{i.severity}</span></td>
                <td className="px-3 py-2">{i.title}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Log Incident"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Incident">
            <FormRow cols={2}>
              <Field label="Incident #" required><Input value={form.incidentNumber} onChange={e => setForm({ ...form, incidentNumber: e.target.value.toUpperCase() })} /></Field>
              <Field label="Date" required><Input type="date" value={form.incidentDate} onChange={e => setForm({ ...form, incidentDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Project"><Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— none —" /></Field>
              <Field label="Reported By" required>
                <UserPicker value={form.reportedBy} onChange={(uid) => setForm({ ...form, reportedBy: uid })} />
              </Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Category" required><Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={[{ value: "injury", label: "Injury" }, { value: "near_miss", label: "Near Miss" }, { value: "property_damage", label: "Property Damage" }, { value: "environmental", label: "Environmental" }, { value: "other", label: "Other" }]} /></Field>
              <Field label="Severity"><Select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }]} /></Field>
            </FormRow>
            <Field label="Title" required><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} /></Field>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
