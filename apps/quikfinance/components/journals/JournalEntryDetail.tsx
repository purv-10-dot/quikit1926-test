"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, FileText, Printer, CheckCircle2, MoreHorizontal, Copy, RotateCcw, Trash2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Line = { account_name?: string; account_code?: string; description?: string | null; contact_name?: string | null; debit?: number | string; credit?: number | string };
type Attachment = { id: string; file_name: string; file_path: string };
type JE = Record<string, unknown> & {
  entry_number?: string; status?: string; entry_date?: string; reference_number?: string | null; memo?: string | null;
  reporting_method?: string; currency?: string; location_name?: string | null; reversal_of_id?: string | null;
  lines?: Line[]; attachments?: Attachment[];
};

const REPORTING_LABEL: Record<string, string> = { accrual_and_cash: "Accrual and Cash", accrual_only: "Accrual Only", cash_only: "Cash Only" };
const TABS = ["Overview", "Activity Logs"] as const;
type Tab = (typeof TABS)[number];

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }

export function JournalEntryDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [tab, setTab] = useState<Tab>("Overview");
  const [view, setView] = useState<"Details" | "PDF">("Details");
  const [busy, setBusy] = useState(false);

  const { data: je, isPending } = useQuery<JE | null>({
    queryKey: ["journal", id],
    queryFn: async () => (await getJson(`/api/v1/journal-entries/${id}`))?.data ?? null
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["journal", id] });
    qc.invalidateQueries({ queryKey: ["module", "journal-entries"] });
    qc.invalidateQueries({ queryKey: ["journal-history", id] });
  };

  const act = async (path: string, msg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/journal-entries/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = (await res.json().catch(() => null)) as { data?: { redirect?: string; number?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Action failed."); return; }
      toast.success(payload?.data?.number ? `${msg} ${payload.data.number}.` : msg);
      refresh();
      if (payload?.data?.redirect) router.push(payload.data.redirect);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm("Delete this journal? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/journal-entries/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the journal."); return; }
      toast.success("Journal deleted.");
      qc.invalidateQueries({ queryKey: ["module", "journal-entries"] });
      router.push("/journal-entries");
    } finally { setBusy(false); }
  };

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!je) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Journal not found.</p><Link href="/journal-entries" className="mt-3 inline-block text-primary hover:underline">← Back to manual journals</Link></div>;

  const lines = je.lines ?? [];
  const attachments = je.attachments ?? [];
  const status = String(je.status ?? "draft");
  const isDraft = status !== "posted";
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  const pdfUrl = `/api/v1/journal-entries/${id}/pdf`;
  const print = () => { const w = window.open(pdfUrl, "_blank"); if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print available */ } }); };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{String(je.entry_number ?? "Journal")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/journal-entries/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Menu trigger={<><FileText className="mr-1 h-4 w-4" />PDF/Print</>} items={[
            { label: "View PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => window.open(pdfUrl, "_blank", "noopener") },
            { label: "Print", icon: <Printer className="h-4 w-4" />, onSelect: print }
          ]} />
          {isDraft ? <Button type="button" size="sm" onClick={() => act("publish", "Journal published.")} disabled={busy}><CheckCircle2 className="mr-1 h-4 w-4" />Publish</Button> : null}
          <Menu trigger={<MoreHorizontal className="h-4 w-4" />} items={[
            { label: "Clone", icon: <Copy className="h-4 w-4" />, onSelect: () => act("clone", "Cloned to") },
            { label: "Create Reverse Journal", icon: <RotateCcw className="h-4 w-4" />, onSelect: () => act("reverse", "Created reverse journal") },
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: remove, danger: true }
          ]} />
          <Button asChild size="sm" variant="ghost"><Link href="/journal-entries" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {isDraft ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">✨ WHAT&apos;S NEXT?</span>
          <span className="text-muted-foreground">This journal is in draft status. Review and Proceed to publish.</span>
          <Button size="sm" onClick={() => act("publish", "Journal published.")} disabled={busy}>Publish</Button>
        </div>
      ) : null}

      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{String(je.entry_number ?? "")}</h2>
            <Badge variant={isDraft ? "secondary" : "default"}>{isDraft ? "Draft" : "Published"}</Badge>
            <div className="ml-auto inline-flex overflow-hidden rounded-md border text-sm">
              {(["Details", "PDF"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={cn("px-3 py-1", view === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>{v}</button>
              ))}
            </div>
          </div>

          {view === "PDF" ? (
            <iframe title="Journal PDF" src={pdfUrl} className="h-[800px] w-full rounded-lg border" />
          ) : (
            <>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <Field k="Journal#" v={je.entry_number} />
                <Field k="Reference Number" v={je.reference_number} />
                <Field k="Journal Date" v={je.entry_date} />
                <Field k="Transaction Type" v="Journal" />
                <Field k="Currency" v={je.currency} />
                <Field k="Reporting Method" v={REPORTING_LABEL[String(je.reporting_method ?? "accrual_and_cash")] ?? "Accrual and Cash"} />
                <Field k="Notes" v={je.memo} />
                {je.reversal_of_id ? <div><p className="text-muted-foreground">Reversal Of</p><Link href={`/journal-entries/${je.reversal_of_id}`} className="text-primary hover:underline">View original</Link></div> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Journal Details</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr><th className="px-4 py-2 text-left">Item</th><th className="px-4 py-2 text-left">Location</th><th className="px-4 py-2 text-left">Contact</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">
                            <p>{l.account_code ? <span className="text-muted-foreground">{l.account_code} · </span> : null}{String(l.account_name ?? "—")}</p>
                            {l.description ? <p className="text-xs text-muted-foreground">{String(l.description)}</p> : null}
                          </td>
                          <td className="px-4 py-2">{String(je.location_name ?? "—")}</td>
                          <td className="px-4 py-2">{l.contact_name ? String(l.contact_name) : "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{Number(l.debit ?? 0) ? format(Number(l.debit)) : ""}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{Number(l.credit ?? 0) ? format(Number(l.credit)) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t text-sm"><td className="px-4 py-2 text-right text-muted-foreground" colSpan={3}>Sub Total</td><td className="px-4 py-2 text-right tabular-nums">{format(totalDebit)}</td><td className="px-4 py-2 text-right tabular-nums">{format(totalCredit)}</td></tr>
                      <tr className="border-t font-bold"><td className="px-4 py-2 text-right" colSpan={3}>Total Amount</td><td className="px-4 py-2 text-right tabular-nums">{format(totalDebit)}</td><td className="px-4 py-2 text-right tabular-nums">{format(totalCredit)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {attachments.length ? (
                <div>
                  <p className="mb-2 text-sm font-semibold">Attachments <span className="text-muted-foreground">({attachments.length})</span></p>
                  <ul className="divide-y rounded-md border">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.file_name}</span></span>
                        <a href={a.file_path} download={a.file_name} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:underline">Download</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <ActivityLogs id={id} />
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>{trigger}<ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className={cn("flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted", it.danger && "text-destructive")}>{it.icon}{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActivityLogs({ id }: { id: string }) {
  const { data = [], isPending } = useQuery({
    queryKey: ["journal-history", id],
    queryFn: async () => ((await getJson(`/api/v1/journal-entries/${id}/history`))?.data ?? []) as Array<{ id: string; action: string; at: string; user_name?: string }>
  });
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {data.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm capitalize">{e.action} <span className="text-muted-foreground">by {e.user_name ?? "User"}</span></p>
            <span className="text-xs text-muted-foreground">{e.at}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
