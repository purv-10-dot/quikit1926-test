"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Loader2, Paperclip, Eye, FileText, ClipboardList, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils/cn";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";
import { DocumentViewer, type ViewerDoc } from "@/components/portal/DocumentViewer";

type Item = { id: string; kind: "request" | "note" | "working_paper"; title: string; body: string | null; status: string; due_date: string | null; created_at: string; attachment_id: string | null; attachment_name: string | null };
type Picked = { name: string; contentType: string; dataUrl: string; size: number };

const KINDS = [
  { value: "request", label: "Document request" },
  { value: "working_paper", label: "Working paper" },
  { value: "note", label: "Audit note" }
];
const NEXT_STATUS: Record<string, { to: string; label: string }> = { open: { to: "received", label: "Mark received" }, received: { to: "closed", label: "Close" } };
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : null);

export function CaAudit() {
  const qc = useQueryClient();
  const [kind, setKind] = useState("request");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [file, setFile] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ViewerDoc | null>(null);

  const { data: items, isPending } = useQuery({
    queryKey: ["ca-audit"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/ca/audit");
      return r.ok ? ((await r.json()).data as Item[]) : [];
    }
  });

  const groups = useMemo(() => ({
    request: (items ?? []).filter((i) => i.kind === "request"),
    working_paper: (items ?? []).filter((i) => i.kind === "working_paper"),
    note: (items ?? []).filter((i) => i.kind === "note")
  }), [items]);

  const pickFile = (f: File | undefined) => {
    if (!f) { setFile(null); return; }
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, contentType: f.type, dataUrl: String(reader.result), size: f.size });
    reader.readAsDataURL(f);
  };

  const create = async () => {
    if (!title.trim()) { toast.error("Add a title."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/portal/ca/audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, body: body || undefined, dueDate: due || undefined, file: kind === "working_paper" && file ? file : undefined })
      });
      if (!r.ok) throw new Error((await r.json())?.error?.message ?? "Failed");
      toast.success("Added.");
      setTitle(""); setBody(""); setDue(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["ca-audit"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const advance = async (item: Item) => {
    const next = NEXT_STATUS[item.status];
    if (!next) return;
    await fetch(`/api/v1/portal/ca/audit/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next.to }) });
    qc.invalidateQueries({ queryKey: ["ca-audit"] });
  };

  const view = async (attachmentId: string) => {
    const r = await fetch(`/api/v1/portal/ca/audit/attachment/${attachmentId}`);
    if (r.ok) setViewing((await r.json()).data as ViewerDoc);
    else toast.error("Could not load attachment.");
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Audit" description="Document requests, working papers and notes for the selected company" />

      <WidgetCard title="Add to the audit file">
        <div className="grid gap-3 px-5 py-4 lg:grid-cols-[200px_1fr]">
          <div><Label>Type</Label><div className="mt-1"><Combobox value={kind} onChange={(v) => { setKind(v); setFile(null); }} options={KINDS} /></div></div>
          <div><Label>Title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "request" ? "e.g. Bank statements Apr–Jun" : kind === "working_paper" ? "e.g. Revenue testing workpaper" : "e.g. Cut-off observation"} /></div>
          <div className="lg:col-span-2"><Label>Details</Label><Textarea className="mt-1" rows={2} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div><Label>{kind === "request" ? "Needed by" : "Date"}</Label><Input type="date" className="mt-1" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          {kind === "working_paper" && (
            <div className="flex items-end">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium hover:text-primary">
                <Paperclip className="h-4 w-4" />{file ? file.name : "Attach file"}
                <input type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t px-5 py-3"><Button onClick={create} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}Add</Button></div>
      </WidgetCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={ClipboardList} title="Document Requests" empty="No requests" items={groups.request} renderExtra={(it) => {
          const next = NEXT_STATUS[it.status];
          return next ? <button onClick={() => advance(it)} className="text-xs font-medium text-primary hover:underline">{next.label}</button> : null;
        }} />
        <Section icon={FileText} title="Working Papers" empty="No working papers" items={groups.working_paper} renderExtra={(it) => it.attachment_id ? (
          <button onClick={() => view(it.attachment_id!)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Eye className="h-3.5 w-3.5" />{it.attachment_name ?? "View"}</button>
        ) : null} />
        <Section icon={StickyNote} title="Audit Notes" empty="No notes" items={groups.note} />
      </div>

      {viewing && <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function statusTone(s: string) {
  return s === "closed" ? "bg-emerald-100 text-emerald-700" : s === "received" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700";
}

function Section({ icon: Icon, title, items, empty, renderExtra }: { icon: typeof ShieldCheck; title: string; items: Item[]; empty: string; renderExtra?: (it: Item) => React.ReactNode }) {
  return (
    <WidgetCard title={`${title} · ${items.length}`}>
      {items.length === 0 ? <EmptyState icon={Icon} title={empty} /> : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{it.title}</p>
                {it.kind !== "note" && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", statusTone(it.status))}>{it.status}</span>}
              </div>
              {it.body && <p className="mt-0.5 text-xs text-muted-foreground">{it.body}</p>}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                {fmtDate(it.due_date) && <span>Due {fmtDate(it.due_date)}</span>}
                {renderExtra?.(it)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
