"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AddButton, EmptyState, useConfirm, SlidePanel, Button, Input, Select, Textarea,
  Field, FormRow, FormSection,
} from "@quikit/ui";
import { AlertTriangle, ArrowLeft, CheckCircle, Trash2, Eye } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Hind {
  id: string; hindranceDate: string; category: string; title: string; description: string | null;
  startDate: string; endDate: string | null; daysImpacted: number | null; status: string;
  project: { id: string; name: string; code: string } | null;
}
interface Opt { id: string; name: string; code?: string }

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700", resolved: "bg-amber-100 text-amber-700", closed: "bg-green-100 text-green-700",
};

const CATEGORIES = [
  { value: "weather", label: "Weather" },
  { value: "permit", label: "Permit / Approval" },
  { value: "material_shortage", label: "Material Shortage" },
  { value: "design_change", label: "Design Change" },
  { value: "labour", label: "Labour" },
  { value: "equipment", label: "Equipment" },
  { value: "external", label: "External (road, utilities)" },
  { value: "other", label: "Other" },
];

export default function HindranceListPage() {
  const [items, setItems] = useState<Hind[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/hindrance"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
  }, [refresh]);

  async function close(h: Hind) {
    const endDate = prompt("End date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!endDate) return;
    await fetch(`/api/projects/hindrance/${h.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate }),
    });
    refresh();
  }
  async function remove(h: Hind) {
    const ok = await confirm({ title: "Delete this hindrance?", description: h.title, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/hindrance/${h.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Hindrance Register</h1>
          <p className="text-xs text-gray-500">Delay log. Supporting evidence for time-extension claims.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add Hindrance</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No hindrances yet" message="Record blockers as they arise." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-right px-3 py-2">Days</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 110 }}></th>
            </tr></thead>
            <tbody>{items.map(h => (
              <tr key={h.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{new Date(h.hindranceDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2"><div className="font-medium text-gray-900">{h.title}</div>{h.description && <div className="text-xs text-gray-500">{h.description}</div>}</td>
                <td className="px-3 py-2"><span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{h.category.replace("_", " ")}</span></td>
                <td className="px-3 py-2 text-gray-700">{h.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right">{h.daysImpacted ?? "—"}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[h.status] ?? "bg-gray-100 text-gray-600"}`}>{h.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/projects/hindrance/${h.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {h.status === "open" && <button onClick={() => close(h)} className="text-gray-400 hover:text-green-600 p-1" title="Close"><CheckCircle className="h-3.5 w-3.5" /></button>}
                  <button onClick={() => remove(h)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {formOpen && <HindranceForm projects={projects} onClose={() => setFormOpen(false)} onSaved={refresh} />}
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────

function HindranceForm({ projects, onClose, onSaved }: { projects: Opt[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    projectId: "", hindranceDate: today, category: "weather", title: "",
    description: "", startDate: today, endDate: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/projects/hindrance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, endDate: f.endDate || null }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }
  return (
    <SlidePanel size="lg" open onClose={onClose} title="Log Hindrance"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || !f.projectId || !f.title || !f.startDate}>{busy ? "Saving…" : "Log"}</Button>
      </>}>
      <div className="space-y-4">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
        <FormSection>
          <Field label="Project" required>
            <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}
              options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— select —" />
          </Field>
          <FormRow cols={2}>
            <Field label="Hindrance Date" required><Input value={f.hindranceDate} onChange={(e) => setF({ ...f, hindranceDate: e.target.value })} placeholder="YYYY-MM-DD" /></Field>
            <Field label="Category" required>
              <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATEGORIES} />
            </Field>
          </FormRow>
          <Field label="Title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Monsoon rain halted excavation" /></Field>
          <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <FormRow cols={2}>
            <Field label="Start Date" required><Input value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} placeholder="YYYY-MM-DD" /></Field>
            <Field label="End Date" hint="Leave blank if ongoing">
              <Input value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} placeholder="YYYY-MM-DD" />
            </Field>
          </FormRow>
        </FormSection>
      </div>
    </SlidePanel>
  );
}
