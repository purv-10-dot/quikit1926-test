"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type AccountRow = { account_id: string; account_name: string; account_code: string | null; account_type: string; group: string; budgeted: number; actual: number; variance: number; variance_pct: number | null };
type Budget = Record<string, unknown> & {
  name?: string; status?: string; fiscal_year?: number; period?: string; department_name?: string | null; department_type?: string | null;
  location_name?: string | null; rolls_up?: string[]; accounts?: AccountRow[];
  totals?: { income_budget: number; income_actual: number; expense_budget: number; expense_actual: number };
};

const PERIOD_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }

export function BudgetDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [busy, setBusy] = useState(false);

  const { data: budget, isPending } = useQuery<Budget | null>({
    queryKey: ["budget", id],
    queryFn: async () => (await getJson(`/api/v1/budgets/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!budget) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Budget not found.</p><Link href="/budgets" className="mt-3 inline-block text-primary hover:underline">← Back to budgets</Link></div>;

  const accounts = budget.accounts ?? [];
  const totals = budget.totals ?? { income_budget: 0, income_actual: 0, expense_budget: 0, expense_actual: 0 };
  const rollsUp = budget.rolls_up ?? [];
  const fy = Number(budget.fiscal_year);

  const remove = async () => {
    if (!window.confirm("Delete this budget? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/budgets/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the budget."); return; }
      toast.success("Budget deleted.");
      qc.invalidateQueries({ queryKey: ["module", "budgets"] });
      router.push("/budgets");
    } finally { setBusy(false); }
  };

  const groups: { key: string; label: string }[] = [{ key: "Income", label: "Income" }, { key: "Expense", label: "Expense" }, { key: "Asset", label: "Asset" }, { key: "Liability", label: "Liability" }, { key: "Equity", label: "Equity" }];
  const netBudget = totals.income_budget - totals.expense_budget;
  const netActual = totals.income_actual - totals.expense_actual;

  const VarianceCell = ({ row }: { row: AccountRow }) => {
    const favorable = row.group === "Income" ? row.variance <= 0 : row.variance >= 0;
    return <span className={cn("tabular-nums", row.variance === 0 ? "text-muted-foreground" : favorable ? "text-emerald-600" : "text-destructive")}>{format(Math.abs(row.variance))}{row.variance !== 0 ? (favorable ? " ▲" : " ▼") : ""}</span>;
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{String(budget.name ?? "Budget")}</h1>
          <p className="text-sm text-muted-foreground">FY {fy}–{(fy + 1) % 100} · {PERIOD_LABEL[String(budget.period)] ?? "Monthly"}{budget.location_name ? ` · ${budget.location_name}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {budget.department_name ? (
            <Badge variant="default" className="gap-1"><Building2 className="h-3 w-3" />{String(budget.department_name)}{budget.department_type === "division" ? " (Division)" : ""}</Badge>
          ) : <Badge variant="secondary">Company-wide</Badge>}
          <Badge variant={budget.status === "active" ? "default" : "secondary"}>{String(budget.status ?? "active")}</Badge>
          <Button asChild size="sm" variant="secondary"><Link href={`/budgets/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Button type="button" size="sm" variant="secondary" onClick={remove} disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
          <Button asChild size="sm" variant="ghost"><Link href="/budgets" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {rollsUp.length ? (
        <div className="rounded-lg border bg-sky-50 p-3 text-sm text-sky-900">
          <span className="font-medium">Division roll-up:</span> actuals include child departments — {rollsUp.join(", ")}.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Income" budget={totals.income_budget} actual={totals.income_actual} good="over" format={format} />
        <SummaryCard label="Expense" budget={totals.expense_budget} actual={totals.expense_actual} good="under" format={format} />
        <SummaryCard label="Net" budget={netBudget} actual={netActual} good="over" format={format} />
      </div>

      <Card><CardContent className="pt-6">
        <p className="mb-2 text-sm font-semibold">Budget vs Actual</p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Budgeted</th><th className="px-4 py-2 text-right">Actual</th><th className="px-4 py-2 text-right">Variance</th><th className="px-4 py-2 text-right">%</th></tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => {
                const rows = accounts.filter((a) => a.group === g.key);
                if (!rows.length) return null;
                const gb = rows.reduce((s, r) => s + r.budgeted, 0);
                const ga = rows.reduce((s, r) => s + r.actual, 0);
                return (
                  <FragmentGroup key={g.key} label={g.label} budget={gb} actual={ga} format={format}>
                    {rows.map((r) => (
                      <tr key={r.account_id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 pl-8">{r.account_code ? <span className="text-muted-foreground">{r.account_code} · </span> : null}{r.account_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{format(r.budgeted)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{format(r.actual)}</td>
                        <td className="px-4 py-2 text-right"><VarianceCell row={r} /></td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.variance_pct != null ? `${r.variance_pct}%` : "—"}</td>
                      </tr>
                    ))}
                  </FragmentGroup>
                );
              })}
              {accounts.length === 0 ? <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>No budgeted accounts.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Actuals are drawn from posted journal entries{budget.department_name ? " tagged to this department/division (and its children)" : ""} within the fiscal year. ▲ favorable · ▼ unfavorable.</p>
      </CardContent></Card>
    </div>
  );
}

function FragmentGroup({ label, budget, actual, format, children }: { label: string; budget: number; actual: number; format: (n: number) => string; children: ReactNode }) {
  return (
    <>
      <tr className="bg-muted/30 font-semibold"><td className="px-4 py-2">{label}</td><td className="px-4 py-2 text-right tabular-nums">{format(budget)}</td><td className="px-4 py-2 text-right tabular-nums">{format(actual)}</td><td /><td /></tr>
      {children}
    </>
  );
}

function SummaryCard({ label, budget, actual, good, format }: { label: string; budget: number; actual: number; good: "over" | "under"; format: (n: number) => string }) {
  const diff = actual - budget;
  const favorable = good === "over" ? diff >= 0 : diff <= 0;
  const pct = budget ? Math.round((actual / budget) * 100) : 0;
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{format(actual)} <span className="text-sm font-normal text-muted-foreground">/ {format(budget)}</span></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", favorable ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(Math.abs(pct), 100)}%` }} />
      </div>
      <p className={cn("mt-1 text-xs", favorable ? "text-emerald-600" : "text-amber-600")}>{pct}% of budget</p>
    </CardContent></Card>
  );
}
