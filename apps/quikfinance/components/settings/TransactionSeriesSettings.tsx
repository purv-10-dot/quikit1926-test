"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";

const MODULES = [
  { key: "journal", label: "Journal" }, { key: "credit_note", label: "Credit Note" }, { key: "payment_received", label: "Customer Payment" },
  { key: "purchase_order", label: "Purchase Order" }, { key: "sales_order", label: "Sales Order" }, { key: "payment_made", label: "Vendor Payment" },
  { key: "vendor_credit", label: "Vendor Credits" }, { key: "invoice", label: "Invoice" }, { key: "quotation", label: "Quote" },
  { key: "delivery_challan", label: "Delivery Challan" }, { key: "bill", label: "Bill" }
] as const;
type Cfg = Record<string, { prefix: string; next_number: number }>;
type Series = { id: string; name: string; is_default: boolean; config: Cfg };

const pad = (n: number) => String(Math.max(n || 1, 1)).padStart(5, "0");

export function TransactionSeriesSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Series | "new" | null>(null);

  const { data: series = [], isPending } = useQuery({
    queryKey: ["transaction-series"],
    queryFn: async () => {
      const r = await fetch("/api/v1/transaction-series");
      return r.ok ? (((await r.json()) as { data?: Series[] }).data ?? []) : [];
    }
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["transaction-series"] });

  const remove = async (id: string) => {
    if (!window.confirm("Delete this series?")) return;
    const res = await fetch(`/api/v1/transaction-series/${id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) { toast.error(body?.error?.message ?? "Could not delete."); return; }
    toast.success("Series deleted."); refresh();
  };

  if (editing) return <SeriesForm series={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between">
        <PageHeader title="Transaction Number Series" description="Define per-module prefixes and starting numbers. Assign a series to a location so its documents are numbered with that series." />
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />New Series</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Series Name</th><th className="px-4 py-2 text-left">Invoice</th><th className="px-4 py-2 text-left">Bill</th><th className="px-4 py-2 text-left">Purchase Order</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
          <tbody className="divide-y">
            {isPending ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>Loading…</td></tr> : series.length === 0 ? (
              <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>No series yet.</td></tr>
            ) : series.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium">{s.name}{s.is_default ? <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.config?.invoice?.prefix ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.config?.bill?.prefix ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.config?.purchase_order?.prefix ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  {!s.is_default ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeriesForm({ series, onClose, onSaved }: { series: Series | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(series);
  const [name, setName] = useState(series?.name ?? "");
  const [isDefault, setIsDefault] = useState(series?.is_default ?? false);
  const [cfg, setCfg] = useState<Cfg>(() => {
    const base: Cfg = {};
    for (const m of MODULES) base[m.key] = series?.config?.[m.key] ?? { prefix: "", next_number: 1 };
    return base;
  });
  const [busy, setBusy] = useState(false);

  const set = (key: string, patch: Partial<{ prefix: string; next_number: number }>) => setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a series name."); return; }
    // Only keep modules that have a prefix configured.
    const config: Cfg = {};
    for (const m of MODULES) { const v = cfg[m.key]; if (v.prefix.trim()) config[m.key] = { prefix: v.prefix.trim(), next_number: Number(v.next_number) || 1 }; }
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/transaction-series/${series!.id}` : "/api/v1/transaction-series", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), is_default: isDefault, config })
      });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the series."); return; }
      toast.success(isEdit ? "Series updated." : "Series created."); onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{isEdit ? "Edit Series" : "New Series"}</h1>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid max-w-xl gap-3 md:grid-cols-[160px_1fr] md:items-center">
        <Label className="text-destructive">Series Name*</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Label>Set as default</Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />Use this series when a location has none assigned.</label>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Module</th><th className="px-4 py-2 text-left">Prefix</th><th className="px-4 py-2 text-left">Starting Number</th><th className="px-4 py-2 text-left">Preview</th></tr></thead>
          <tbody className="divide-y">
            {MODULES.map((m) => (
              <tr key={m.key}>
                <td className="px-4 py-2">{m.label}</td>
                <td className="px-4 py-2"><Input className="h-8 w-32" value={cfg[m.key].prefix} onChange={(e) => set(m.key, { prefix: e.target.value })} placeholder="e.g. INV-" /></td>
                <td className="px-4 py-2"><Input className="h-8 w-28" type="number" min="1" value={cfg[m.key].next_number} onChange={(e) => set(m.key, { next_number: Number(e.target.value) })} /></td>
                <td className={cn("px-4 py-2 tabular-nums", !cfg[m.key].prefix.trim() && "text-muted-foreground")}>{cfg[m.key].prefix.trim() ? `${cfg[m.key].prefix.trim()}${pad(cfg[m.key].next_number)}` : "— not numbered —"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
