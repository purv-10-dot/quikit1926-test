"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function BudgetVsActualPage() {
  const { t } = useI18n();
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["budget-vs-actual", fiscalYear],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/budget-vs-actual?fiscal_year=${fiscalYear}`);
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const summary = meta.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Budget vs Actual" description="Compare planned budgets against actual journal entry activity for the fiscal year." />

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label>Fiscal Year</Label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>FY {y}–{y + 1}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Budgeted</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_budgeted ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Actual</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_actual ?? 0)}</p></CardContent></Card>
        <Card className={summary.total_variance > 0 ? "border-red-200" : "border-green-200"}>
          <CardHeader className="pb-1"><CardTitle className={`text-xs ${summary.total_variance > 0 ? "text-red-600" : "text-green-600"}`}>Variance</CardTitle></CardHeader>
          <CardContent><p className={`text-xl font-bold ${summary.total_variance > 0 ? "text-red-600" : "text-green-600"}`}>{fmt(summary.total_variance ?? 0)}</p></CardContent>
        </Card>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Account</th>
              <th className="text-left px-4 py-3 font-medium">Budget</th>
              <th className="text-right px-4 py-3 font-medium">Budgeted</th>
              <th className="text-right px-4 py-3 font-medium">Actual</th>
              <th className="text-right px-4 py-3 font-medium">Variance</th>
              <th className="text-right px-4 py-3 font-medium">Variance %</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No budgets found. Create budgets in the Budgets section to compare against actuals.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>, i: number) => {
              const variance = Number(r.variance ?? 0);
              return (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground">{String(r.account_code)} </span>
                    {String(r.account_name)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{String(r.budget_name)}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.budgeted))}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.actual))}</td>
                  <td className={`px-4 py-2 text-right font-medium ${variance > 0 ? "text-red-600" : variance < 0 ? "text-green-600" : ""}`}>
                    {variance >= 0 ? "+" : ""}{fmt(variance)}
                  </td>
                  <td className={`px-4 py-2 text-right text-xs ${variance > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {r.variance_pct != null ? `${Number(r.variance_pct).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
