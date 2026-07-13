"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Plus, X, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { TDS_ACTS, TDS_SECTIONS, tdsActLabel } from "@/lib/tds";
import { cn } from "@/lib/utils/cn";

type TdsRate = { id: string; name: string; rate: number | string; tax_act: string; section: string | null; higher_rate: boolean; start_date: string | null; end_date: string | null; is_active: boolean };
type TdsData = { available: boolean; country: string | null; apply_level: "transaction" | "line_item"; liabilities_report: boolean; rates: TdsRate[] };

const TABS = ["Income TDS Settings", "Income TDS Rates"] as const;
type Tab = (typeof TABS)[number];

export function DirectTaxes() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Income TDS Settings");
  const [editing, setEditing] = useState<TdsRate | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery<TdsData | null>({
    queryKey: ["tds"],
    queryFn: async () => { const r = await fetch("/api/v1/settings/tds"); return r.ok ? (((await r.json()) as { data?: TdsData }).data ?? null) : null; }
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tds"] });

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/settings/tds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { toast.error("Could not save."); return; }
      toast.success("TDS settings saved."); refresh();
    } finally { setBusy(false); }
  };

  if (isPending) return <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-card">Loading…</div>;

  if (data && !data.available) {
    return (
      <div className="space-y-5 animate-fade-up">
        <PageHeader title="Direct Taxes" description="TDS & TCS configuration." />
        <div className="flex items-start gap-3 rounded-2xl border bg-amber-50 p-5 text-sm shadow-card">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-amber-900">Direct Taxes (TDS/TCS) are available only for organizations based in India. Set your country to India in <Link href="/settings/organization" className="font-medium underline">Organization → Profile</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Direct Taxes" description="Income TDS settings and TDS rate masters." />

      <div className="flex items-start gap-3 rounded-xl border bg-amber-50/70 p-3 text-[13px] text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p><span className="font-semibold">Attention:</span> The Income Tax Act, 2025 is in effect from April 1, 2026, with changes to TDS/TCS sections and rates. Keep your rates updated to stay compliant.</p>
      </div>

      <div role="tablist" className="flex gap-1 border-b">
        {TABS.map((tname) => (
          <button key={tname} type="button" role="tab" aria-selected={tab === tname} onClick={() => setTab(tname)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === tname ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{tname}</button>
        ))}
      </div>

      {tab === "Income TDS Settings" ? (
        <div className="max-w-2xl space-y-5 rounded-2xl border bg-card p-5 shadow-card">
          <div>
            <p className="text-[15px] font-semibold tracking-tight">TDS</p>
            <p className="text-[13px] text-muted-foreground">TDS (Tax Deducted at Source) can be applied at the transaction level or at the line-item level.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Apply TDS:</p>
            <div className="space-y-2">
              {([["transaction", "At Transaction Level", "TDS will be applied to the transaction's total."], ["line_item", "At Line Item Level", "TDS will be applied to the line items for which you associate TDS."]] as const).map(([val, label, hint]) => (
                <label key={val} className="flex cursor-pointer items-start gap-2.5">
                  <input type="radio" name="tds-level" className="mt-0.5 accent-sky-600" checked={data?.apply_level === val} onChange={() => patch({ apply_level: val })} />
                  <span><span className="block text-sm font-medium">{label}</span><span className="block text-[12px] text-muted-foreground">{hint}</span></span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 border-t pt-4 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={Boolean(data?.liabilities_report)} onChange={(e) => patch({ liabilities_report: e.target.checked })} />
            Enable TDS Liabilities Report
          </label>
          <p className="text-[12px] text-muted-foreground">{busy ? "Saving…" : "Changes save automatically."}</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-4">
            <p className="text-[15px] font-semibold tracking-tight">All TDS Rates</p>
            <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New TDS Tax</Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2.5 text-left">Tax Name</th><th className="px-4 py-2.5 text-right">Rate (%)</th><th className="px-4 py-2.5 text-left">Tax Type</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
            <tbody className="divide-y">
              {(data?.rates ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium text-primary">{r.name}{r.higher_rate ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">HIGHER</span> : null}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.rate)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.section ? `Section ${r.section}` : "—"}</td>
                  <td className="px-4 py-2.5"><span className={cn("text-xs font-medium", r.is_active ? "text-emerald-600" : "text-muted-foreground")}>{r.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!window.confirm("Delete this TDS rate?")) return; const res = await fetch(`/api/v1/tds-rates/${r.id}`, { method: "DELETE" }); if (res.ok) { toast.success("Deleted."); refresh(); } else toast.error("Could not delete."); }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
              {(data?.rates.length ?? 0) === 0 ? <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>No TDS rates yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      {editing ? <TdsModal rate={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </div>
  );
}

function TdsModal({ rate, onClose, onSaved }: { rate: TdsRate | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(rate);
  const [name, setName] = useState(rate?.name ?? "");
  const [rateVal, setRateVal] = useState(rate ? String(rate.rate) : "");
  const [act, setAct] = useState(rate?.tax_act ?? "new_2025");
  const [section, setSection] = useState(rate?.section ?? "");
  const [higher, setHigher] = useState(rate?.higher_rate ?? false);
  const [start, setStart] = useState(rate?.start_date ?? "2026-04-01");
  const [end, setEnd] = useState(rate?.end_date ?? "");
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => TDS_SECTIONS[act] ?? [], [act]);

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a tax name."); return; }
    if (rateVal === "" || Number.isNaN(Number(rateVal))) { toast.error("Enter a valid rate."); return; }
    const payload = { name: name.trim(), rate: Number(rateVal), tax_act: act, section: section || null, higher_rate: higher, start_date: start || null, end_date: end || null, is_active: true };
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/tds-rates/${rate!.id}` : "/api/v1/tds-rates", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the TDS rate."); return; }
      toast.success(isEdit ? "TDS rate updated." : "TDS rate added."); onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4"><h2 className="text-[15px] font-semibold">{isEdit ? "Edit TDS" : "New TDS"}</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button></div>
        <div className="grid grid-cols-2 gap-4 p-5">
          <div><Label className="text-destructive">Tax Name*</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-destructive">Rate (%)*</Label><Input className="mt-1" type="number" step="0.01" min="0" value={rateVal} onChange={(e) => setRateVal(e.target.value)} /></div>
          <div className="col-span-2"><Label>Applicable Income Tax Act</Label>
            <select className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm" value={act} onChange={(e) => { setAct(e.target.value); setSection(""); }}>
              {TDS_ACTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="col-span-2"><Label className="text-destructive">Section*</Label>
            <select className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm" value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Select a Tax Type</option>
              {sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">By default, TDS is tracked under TDS Payable and TDS Receivable accounts.</p>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={higher} onChange={(e) => setHigher(e.target.checked)} />This is a Higher TDS Rate</label>
          <div className="col-span-2"><p className="mb-1 text-sm font-semibold">Applicable Period</p></div>
          <div><Label>Start Date</Label><Input className="mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End Date</Label><Input className="mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 border-t p-4"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}
