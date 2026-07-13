"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Lock, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";

type Term = { id: string; name: string; term_type: string; days: number; is_default: boolean; is_active: boolean; is_system: boolean };

export function PaymentTermsSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Term | "new" | null>(null);

  const { data: terms = [], isPending } = useQuery({
    queryKey: ["payment-terms"],
    queryFn: async () => { const r = await fetch("/api/v1/payment-terms"); return r.ok ? (((await r.json()) as { data?: Term[] }).data ?? []) : []; }
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payment-terms"] });

  const remove = async (id: string) => {
    if (!window.confirm("Delete this payment term?")) return;
    const res = await fetch(`/api/v1/payment-terms/${id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) { toast.error(body?.error?.message ?? "Could not delete."); return; }
    toast.success("Payment term deleted."); refresh();
  };

  const makeDefault = async (t: Term) => {
    const res = await fetch(`/api/v1/payment-terms/${t.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, term_type: t.term_type, days: t.days, is_default: true, is_active: t.is_active }) });
    if (res.ok) { toast.success(`${t.name} is now the default.`); refresh(); } else toast.error("Could not update.");
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between">
        <PageHeader title="Payment Terms" description="Define the due-date terms offered on invoices, bills, and orders." />
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New Payment Term</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2.5 text-left">Terms</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
          <tbody className="divide-y">
            {isPending ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={3}>Loading…</td></tr> : terms.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2 font-medium text-primary">{t.name}
                    {t.is_system ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    {t.is_default ? <span className="rounded border bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">Default</span> : null}
                  </span>
                </td>
                <td className="px-4 py-2.5"><span className={cn("text-xs font-medium", t.is_active ? "text-emerald-600" : "text-muted-foreground")}>{t.is_active ? "Active" : "Inactive"}</span></td>
                <td className="px-4 py-2.5 text-right">
                  {!t.is_default ? <Button size="sm" variant="ghost" aria-label="Make default" title="Make default" onClick={() => makeDefault(t)}><Star className="h-4 w-4" /></Button> : null}
                  {!t.is_system ? <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button> : null}
                  {!t.is_system ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? <TermModal term={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </div>
  );
}

function TermModal({ term, onClose, onSaved }: { term: Term | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(term);
  const [name, setName] = useState(term?.name ?? "");
  const [days, setDays] = useState(term ? String(term.days) : "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a term name."); return; }
    if (days === "" || Number.isNaN(Number(days))) { toast.error("Enter the number of days."); return; }
    const payload = { name: name.trim(), term_type: "days", days: Number(days), is_default: term?.is_default ?? false, is_active: term?.is_active ?? true };
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/payment-terms/${term!.id}` : "/api/v1/payment-terms", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the payment term."); return; }
      toast.success(isEdit ? "Payment term updated." : "Payment term added."); onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4"><h2 className="text-[15px] font-semibold">{isEdit ? "Edit Payment Term" : "New Payment Term"}</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button></div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-[110px_1fr] items-center gap-3"><Label className="text-destructive">Term Name*</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-[110px_1fr] items-center gap-3"><Label className="text-destructive">Due After*</Label>
            <div className="flex items-center gap-2"><Input type="number" min="0" className="flex-1" value={days} onChange={(e) => setDays(e.target.value)} /><span className="text-sm text-muted-foreground">Days</span></div>
          </div>
        </div>
        <div className="flex gap-2 border-t p-4"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}
