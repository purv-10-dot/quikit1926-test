"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { todayISO } from "@/lib/utils/dates";

type Acct = { id: string; code: string; name: string; account_type: string; group: string; available: number; debit: number; credit: number };
type Data = { migration_date: string | null; accounts: Acct[] };

const GROUP_ORDER = ["Accounts Receivable", "Accounts Payable", "Asset", "Expense", "Bank", "Liability", "Equity", "Income"];
const DEFAULT_OPEN = new Set(["Accounts Receivable", "Accounts Payable", "Asset", "Bank"]);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function OpeningBalances() {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const { data } = useQuery<Data>({
    queryKey: ["opening-balances"],
    queryFn: async () => { const r = await fetch("/api/v1/settings/opening-balances"); return r.ok ? (((await r.json()) as { data?: Data }).data ?? { migration_date: null, accounts: [] }) : { migration_date: null, accounts: [] }; },
    initialData: { migration_date: null, accounts: [] }
  });

  const [migrationDate, setMigrationDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, { debit: string; credit: string }>>({});
  const [open, setOpen] = useState<Set<string>>(DEFAULT_OPEN);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.migration_date) setMigrationDate(data.migration_date);
    const v: Record<string, { debit: string; credit: string }> = {};
    for (const a of data.accounts) v[a.id] = { debit: a.debit ? String(a.debit) : "", credit: a.credit ? String(a.credit) : "" };
    setValues(v);
  }, [data]);

  const set = (id: string, field: "debit" | "credit", value: string) =>
    setValues((c) => ({ ...c, [id]: field === "debit" ? { debit: value, credit: "" } : { debit: "", credit: value } }));

  const grouped = useMemo(() => {
    const map = new Map<string, Acct[]>();
    for (const a of data?.accounts ?? []) { if (!map.has(a.group)) map.set(a.group, []); map.get(a.group)!.push(a); }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, accounts: map.get(g)! }));
  }, [data]);

  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const id of Object.keys(values)) { dr += Number(values[id]?.debit) || 0; cr += Number(values[id]?.credit) || 0; }
    dr = round2(dr); cr = round2(cr);
    const diff = round2(dr - cr);
    const adjDr = diff < 0 ? -diff : 0, adjCr = diff > 0 ? diff : 0;
    return { dr, cr, adjDr, adjCr, totalDr: round2(dr + adjDr), totalCr: round2(cr + adjCr) };
  }, [values]);

  const save = async () => {
    if (!migrationDate) { toast.error("Choose a migration date."); return; }
    const lines = Object.entries(values)
      .map(([account_id, v]) => ({ account_id, debit: Number(v.debit) || 0, credit: Number(v.credit) || 0 }))
      .filter((l) => l.debit !== 0 || l.credit !== 0);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/settings/opening-balances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ migration_date: migrationDate, lines }) });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save opening balances."); return; }
      toast.success("Opening balances posted.");
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
    } finally { setBusy(false); }
  };

  const toggle = (g: string) => setOpen((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const avail = (n: number) => (n === 0 ? "-" : `${format(Math.abs(n))} ${n >= 0 ? "Dr" : "Cr"}`);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Opening Balances" description="Enter your trial-balance figures as of the migration date. The difference is posted to Opening Balance Adjustments so the entry stays balanced." />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <Label className="text-destructive">Migration Date*</Label>
        <Input type="date" className="w-44" value={migrationDate} onChange={(e) => setMigrationDate(e.target.value)} />
        <span className="text-[12px] text-muted-foreground">The date your previous system's Trial Balance was generated.</span>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {grouped.map(({ group, accounts }) => {
          const isOpen = open.has(group);
          return (
            <div key={group} className="border-b last:border-b-0">
              <button type="button" onClick={() => toggle(group)} className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2.5 text-left text-sm font-semibold hover:bg-muted/60">
                <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />{group}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">({accounts.length})</span>
              </button>
              {isOpen ? (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left font-medium">Accounts</th><th className="px-4 py-2 text-right font-medium">Available Balance</th><th className="px-4 py-2 text-right font-medium">Debit (₹)</th><th className="px-4 py-2 text-right font-medium">Credit (₹)</th></tr></thead>
                  <tbody className="divide-y">
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-1.5">{a.code ? <span className="text-muted-foreground">{a.code} · </span> : null}{a.name}</td>
                        <td className="px-4 py-1.5 text-right text-muted-foreground tabular-nums">{avail(a.available)}</td>
                        <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-8 text-right" value={values[a.id]?.debit ?? ""} onChange={(e) => set(a.id, "debit", e.target.value)} /></td>
                        <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-8 text-right" value={values[a.id]?.credit ?? ""} onChange={(e) => set(a.id, "credit", e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border bg-amber-50/50 p-4 text-sm shadow-card">
        <div className="grid grid-cols-[1fr_140px_140px] gap-2">
          <span className="text-right font-semibold">Total</span>
          <span className="text-right tabular-nums">{format(totals.dr)}</span>
          <span className="text-right tabular-nums">{format(totals.cr)}</span>
          <span className="text-right text-rose-600">Opening Balance Adjustments<span className="block text-[11px] font-normal text-muted-foreground">Holds the difference between debit and credit.</span></span>
          <span className="text-right tabular-nums text-rose-600">{totals.adjDr ? format(totals.adjDr) : ""}</span>
          <span className="text-right tabular-nums text-rose-600">{totals.adjCr ? format(totals.adjCr) : ""}</span>
          <span className="border-t pt-1 text-right font-bold">Total Amount</span>
          <span className="border-t pt-1 text-right font-bold tabular-nums">{format(totals.totalDr)}</span>
          <span className="border-t pt-1 text-right font-bold tabular-nums">{format(totals.totalCr)}</span>
        </div>
      </div>

      <div className="flex gap-2"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Opening Balances"}</Button></div>
    </div>
  );
}
