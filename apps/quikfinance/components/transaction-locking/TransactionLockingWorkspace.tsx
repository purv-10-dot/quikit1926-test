"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/shared/PageHeader";
import { todayISO } from "@/lib/utils/dates";

type LockRow = { id: string; start_date: string; end_date: string; lock_scope: string; reason: string | null; is_active: boolean; status?: string };

const MODULES = [
  { scope: "sales", title: "Sales", desc: "Invoices, sales orders, quotations, credit notes, and payments received." },
  { scope: "purchases", title: "Purchases", desc: "Bills, purchase orders, vendor credits, expenses, and payments made." },
  { scope: "banking", title: "Banking", desc: "Bank transactions, transfers, and reconciliations." },
  { scope: "journals", title: "Accountant", desc: "Manual journals and other accountant entries." }
] as const;

function fmtDate(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function TransactionLockingWorkspace() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ scope: string; title: string; existing?: LockRow } | null>(null);

  const { data: locks = [], isPending } = useQuery({
    queryKey: ["transaction-locks"],
    queryFn: async () => {
      const r = await fetch("/api/v1/period-locks");
      if (!r.ok) return [] as LockRow[];
      return (((await r.json()) as { data?: LockRow[] }).data ?? []).filter((l) => l.is_active);
    }
  });

  const byScope = useMemo(() => {
    const m = new Map<string, LockRow>();
    for (const l of locks) if (!m.has(l.lock_scope)) m.set(l.lock_scope, l); // list is newest-first
    return m;
  }, [locks]);

  const allLock = byScope.get("all") ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["transaction-locks"] });

  const unlock = async (id: string) => {
    if (!window.confirm("Unlock this module? Users will be able to edit back-dated transactions again.")) return;
    const res = await fetch(`/api/v1/period-locks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not unlock."); return; }
    toast.success("Module unlocked."); refresh();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Transaction Locking" description="Transaction locking prevents you and your users from making changes to transactions that might affect your accounts. Once locked, users cannot edit, modify, or delete any transaction recorded on or before the specified date in that module." />

      <div className="space-y-3">
        {MODULES.map((mod) => {
          const lock = byScope.get(mod.scope) ?? null;
          const covered = allLock; // a global "Lock All" covers every module
          const effective = lock ?? covered;
          const isLocked = Boolean(effective);
          return (
            <div key={mod.scope} className={cn("flex items-start justify-between gap-4 rounded-lg border bg-card p-5", isLocked && "border-emerald-200 bg-emerald-50/40")}>
              <div className="flex items-start gap-4">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", isLocked ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                  {isLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-semibold">{mod.title}</p>
                  {lock ? (
                    <p className="text-sm text-muted-foreground">Locked through <span className="font-medium text-foreground">{fmtDate(lock.end_date)}</span>{lock.reason ? ` · ${lock.reason}` : ""}</p>
                  ) : covered ? (
                    <p className="text-sm text-muted-foreground">Covered by <span className="font-medium">Lock All</span> through {fmtDate(covered.end_date)}.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">You have not locked the transactions in this module.</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{mod.desc}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lock ? (
                  <>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ scope: mod.scope, title: mod.title, existing: lock })}>Edit</Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => unlock(lock.id)}>Unlock</Button>
                  </>
                ) : covered ? null : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ scope: mod.scope, title: mod.title })}><Lock className="mr-1 h-4 w-4" />Lock</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn("flex items-center justify-between gap-4 rounded-lg border p-4", allLock ? "border-emerald-200 bg-emerald-50/40" : "bg-amber-50/60")}>
        <div>
          <p className="font-semibold">Lock All Transactions At Once</p>
          {allLock ? (
            <p className="text-sm text-muted-foreground">All transactions are locked through <span className="font-medium text-foreground">{fmtDate(allLock.end_date)}</span>{allLock.reason ? ` · ${allLock.reason}` : ""}.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Freeze all transactions at once instead of locking Sales, Purchases, Banking, and Accountant individually.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allLock ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ scope: "all", title: "All Transactions", existing: allLock })}>Edit</Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => unlock(allLock.id)}>Unlock</Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => setDialog({ scope: "all", title: "All Transactions" })}>Lock All Transactions →</Button>
          )}
        </div>
      </div>

      {isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {dialog ? (
        <LockDialog scope={dialog.scope} title={dialog.title} existing={dialog.existing}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />
      ) : null}
    </div>
  );
}

function LockDialog({ scope, title, existing, onClose, onSaved }: { scope: string; title: string; existing?: LockRow; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(existing?.end_date ?? todayISO());
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!date) { toast.error("Choose a lock date."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/period-locks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Zoho semantics: lock everything on/before `date`. Modelled as the range [1900-01-01, date].
        body: JSON.stringify({ lock_scope: scope, start_date: "1900-01-01", end_date: date, reason: reason.trim() || null, is_active: true })
      });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not lock transactions."); return; }
      toast.success(`${title} transactions locked through ${date}.`);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-24 w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{existing ? "Edit Lock" : "Lock"} — {title}</h2>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <Label className="text-destructive">Lock transactions created on or before*</Label>
        <Input type="date" className="mb-3 mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        <Label>Reason</Label>
        <Textarea className="mt-1" rows={3} maxLength={500} placeholder="e.g. FY close — books locked after audit." value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy}>{busy ? "Locking…" : existing ? "Update Lock" : "Lock"}</Button>
        </div>
      </div>
    </div>
  );
}
