"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Copy } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Account = { id: string; name: string; kind: string };
type Txn = { id: string; date: string; description: string | null; payee: string | null; amount: number; reference: string | null; status: string };

type Ledger = { id: string; name: string; code: string | null; account_type: string };

export default function BankTransactionsPage() {
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: ledgers = [] } = useQuery<Ledger[]>({
    queryKey: ["ledger-accounts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await fetch("/api/v1/accounts?per_page=300");
      const list = r.ok ? (((await r.json()) as { data?: Ledger[] }).data ?? []) : [];
      // Offer income/expense/asset/liability accounts as categories (exclude the bank/cash control rows is optional).
      return list.map((a) => ({ id: a.id, name: a.name, code: a.code ?? null, account_type: a.account_type }));
    }
  });

  const categorize = async (txnId: string, ledgerId: string) => {
    setBusy(txnId);
    try {
      const r = await fetch(`/api/v1/banking/transactions/${txnId}/categorize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: ledgerId }) });
      const b = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!r.ok) { toast.error(b?.error?.message ?? "Could not categorize."); return; }
      toast.success("Transaction categorized — posted to the ledger.");
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["banking-overview"] });
    } finally { setBusy(null); }
  };

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["bank-accounts-list"],
    queryFn: async () => {
      const r = await fetch("/api/v1/banking/overview");
      const d = r.ok ? (await r.json()).data : null;
      return (d?.accounts ?? []) as Account[];
    }
  });
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId]);

  const { data: txns = [] } = useQuery<Txn[]>({
    queryKey: ["bank-txns", accountId],
    enabled: Boolean(accountId),
    queryFn: async () => {
      const r = await fetch(`/api/v1/banking/import?bank_account_id=${accountId}`);
      return r.ok ? (((await r.json()) as { data?: Txn[] }).data ?? []) : [];
    }
  });

  // Duplicate detection: same absolute amount + same date appearing more than once.
  const dupKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of txns) { const k = `${t.date}|${Math.abs(t.amount)}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [txns]);

  const inflow = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = txns.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const uncategorized = txns.filter((t) => t.status === "uncategorized").length;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Transactions" description="Imported bank activity — categorize, match, and spot duplicates." />
        <div className="flex items-center gap-2">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 rounded-xl border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
            {accounts.length === 0 ? <option value="">No accounts</option> : accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Link href="/banking/import" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90">Import statement</Link>
        </div>
      </div>

      {/* Flow summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-border/50 bg-card p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><ArrowDownLeft className="h-4 w-4 text-emerald-500" />Money in</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{format(inflow)}</p>
        </div>
        <div className="rounded-3xl border border-border/50 bg-card p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><ArrowUpRight className="h-4 w-4 text-rose-500" />Money out</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600">{format(outflow)}</p>
        </div>
        <div className="rounded-3xl border border-border/50 bg-card p-4 shadow-card">
          <p className="text-[12px] font-medium text-muted-foreground">To categorize</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{uncategorized}</p>
        </div>
      </div>

      {/* Transaction cards */}
      {txns.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center text-sm text-muted-foreground">
          No transactions yet. <Link href="/banking/import" className="font-medium text-indigo-600 hover:underline">Import a statement</Link> to get started.
        </div>
      ) : (
        <div className="space-y-2.5">
          {txns.map((t) => {
            const credit = t.amount >= 0;
            const isDup = dupKeys.has(`${t.date}|${Math.abs(t.amount)}`);
            return (
              <div key={t.id} className="group flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", credit ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                  {credit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.payee || t.description || "Transaction"}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{t.date}{t.reference ? ` · ${t.reference}` : ""}{t.description && t.payee ? ` · ${t.description}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isDup ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><Copy className="h-3 w-3" />Possible duplicate</span> : null}
                  {t.status === "uncategorized" ? (
                    <select aria-label="Categorize" defaultValue="" disabled={busy === t.id}
                      onChange={(e) => { if (e.target.value) categorize(t.id, e.target.value); }}
                      className="h-8 max-w-[180px] rounded-lg border bg-background px-2 text-[12px] outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                      <option value="">{busy === t.id ? "Posting…" : "Categorize as…"}</option>
                      {ledgers.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
                    </select>
                  ) : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Categorized</span>}
                  <span className={cn("w-28 text-right text-sm font-bold tabular-nums", credit ? "text-emerald-600" : "text-foreground")}>{credit ? "+" : "−"}{format(Math.abs(t.amount))}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
