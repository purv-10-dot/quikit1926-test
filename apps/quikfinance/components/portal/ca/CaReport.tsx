"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Type = "trial-balance" | "profit-loss" | "balance-sheet";
type Line = { code: string; name: string; debit?: string; credit?: string; amount?: string; balance?: string };

export function CaReport({ type, title, description }: { type: Type; title: string; description?: string }) {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["ca-report", type],
    queryFn: async () => {
      const r = await fetch(`/api/v1/portal/ca/report?type=${type}`);
      return r.ok ? ((await r.json()).data as Record<string, unknown>) : null;
    }
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title={title} description={description} actions={
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium shadow-card hover:text-primary"><Download className="h-4 w-4" />Export</button>
      } />
      {isPending ? (
        <div className="space-y-2 rounded-2xl border bg-card p-5 shadow-card">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : !data ? (
        <EmptyState title="Report unavailable" hint="Select a company from the switcher above." />
      ) : type === "trial-balance" ? (
        <TrialBalance data={data} format={format} />
      ) : type === "profit-loss" ? (
        <ProfitLoss data={data} format={format} />
      ) : (
        <BalanceSheet data={data} format={format} />
      )}
    </div>
  );
}

function TB({ rows, format, cols }: { rows: Line[]; format: (n: number) => string; cols: { key: keyof Line; label: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-5 py-2.5 text-left">Account</th>{cols.map((c) => <th key={String(c.key)} className="px-5 py-2.5 text-right">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/40">
              <td className="px-5 py-2 "><span className="text-muted-foreground">{r.code}</span> {r.name}</td>
              {cols.map((c) => <td key={String(c.key)} className="px-5 py-2 text-right tabular-nums">{r[c.key] ? format(Number(r[c.key])) : "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrialBalance({ data, format }: { data: Record<string, unknown>; format: (n: number) => string }) {
  const rows = (data.rows as Line[]) ?? [];
  const totals = data.totals as { debit: number; credit: number; balanced: boolean };
  return (
    <WidgetCard title="Trial Balance" action={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", totals?.balanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{totals?.balanced ? "Balanced" : "Out of balance"}</span>}>
      {rows.length === 0 ? <EmptyState title="No ledger activity" /> : <>
        <TB rows={rows} format={format} cols={[{ key: "debit", label: "Debit" }, { key: "credit", label: "Credit" }]} />
        <div className="flex justify-end gap-8 border-t px-5 py-3 text-sm font-semibold tabular-nums"><span>Debit {format(totals.debit)}</span><span>Credit {format(totals.credit)}</span></div>
      </>}
    </WidgetCard>
  );
}

function ProfitLoss({ data, format }: { data: Record<string, unknown>; format: (n: number) => string }) {
  const income = (data.income as Line[]) ?? [];
  const expense = (data.expense as Line[]) ?? [];
  const totals = data.totals as { income: number; expense: number; net: number };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WidgetCard title={`Income · ${format(totals?.income ?? 0)}`}>{income.length ? <TB rows={income} format={format} cols={[{ key: "amount", label: "Amount" }]} /> : <EmptyState title="No income" />}</WidgetCard>
      <WidgetCard title={`Expenses · ${format(totals?.expense ?? 0)}`}>{expense.length ? <TB rows={expense} format={format} cols={[{ key: "amount", label: "Amount" }]} /> : <EmptyState title="No expenses" />}</WidgetCard>
      <div className="lg:col-span-2 rounded-2xl border bg-[#0f172a] p-5 text-white shadow-popover">
        <p className="text-[11px] uppercase tracking-widest text-white/60">Net profit</p>
        <p className={cn("mt-1 text-3xl font-bold tabular-nums", (totals?.net ?? 0) < 0 && "text-rose-300")}>{format(totals?.net ?? 0)}</p>
      </div>
    </div>
  );
}

function BalanceSheet({ data, format }: { data: Record<string, unknown>; format: (n: number) => string }) {
  const assets = (data.assets as Line[]) ?? [];
  const liabilities = (data.liabilities as Line[]) ?? [];
  const equity = (data.equity as Line[]) ?? [];
  const t = data.totals as { assets: number; liabilities: number; equity: number };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WidgetCard title={`Assets · ${format(t?.assets ?? 0)}`}>{assets.length ? <TB rows={assets} format={format} cols={[{ key: "balance", label: "Balance" }]} /> : <EmptyState title="No assets" />}</WidgetCard>
      <div className="space-y-4">
        <WidgetCard title={`Liabilities · ${format(t?.liabilities ?? 0)}`}>{liabilities.length ? <TB rows={liabilities} format={format} cols={[{ key: "balance", label: "Balance" }]} /> : <EmptyState title="No liabilities" />}</WidgetCard>
        <WidgetCard title={`Equity · ${format(t?.equity ?? 0)}`}>{equity.length ? <TB rows={equity} format={format} cols={[{ key: "balance", label: "Balance" }]} /> : <EmptyState title="No equity" />}</WidgetCard>
      </div>
    </div>
  );
}
