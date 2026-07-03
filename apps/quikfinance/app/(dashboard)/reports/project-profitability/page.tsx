"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}
function fmtHrs(v: number) {
  return `${Number(v).toFixed(1)}h`;
}
function pct(v: number | null) {
  return v != null ? `${Number(v).toFixed(1)}%` : "—";
}

export default function ProjectProfitabilityPage() {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["project-profitability"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reports/project-profitability");
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const summary = meta.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Project Profitability"
        description="Revenue, cost, gross profit, and margin for each project. Includes labor hours, expenses, and billed amounts."
        actionLabel="New Project"
        actionHref="/projects"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_revenue ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Cost</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_cost ?? 0)}</p></CardContent></Card>
        <Card className={summary.total_profit >= 0 ? "border-green-200" : "border-red-200"}>
          <CardHeader className="pb-1"><CardTitle className={`text-xs ${summary.total_profit >= 0 ? "text-green-600" : "text-red-600"}`}>Gross Profit</CardTitle></CardHeader>
          <CardContent><p className={`text-xl font-bold ${summary.total_profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(summary.total_profit ?? 0)}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Hours</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmtHrs(summary.total_hours ?? 0)}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Project</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Hours</th>
              <th className="text-right px-4 py-3 font-medium">Revenue</th>
              <th className="text-right px-4 py-3 font-medium">Cost</th>
              <th className="text-right px-4 py-3 font-medium">Profit</th>
              <th className="text-right px-4 py-3 font-medium">Margin</th>
              <th className="text-right px-4 py-3 font-medium">Budget Util.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No projects found. Create projects and log time to see profitability.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const profit = Number(r.gross_profit ?? 0);
              return (
                <tr key={String(r.project_id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={`/projects/${r.project_id}`} className="text-primary hover:underline font-medium">{String(r.project_name)}</Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{String(r.customer ?? "—")}</td>
                  <td className="px-4 py-2 text-center"><Badge variant="secondary">{String(r.status)}</Badge></td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{fmtHrs(Number(r.total_hours))}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.total_revenue))}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.total_cost))}</td>
                  <td className={`px-4 py-2 text-right font-medium ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(profit)}</td>
                  <td className={`px-4 py-2 text-right text-xs ${Number(r.margin_pct ?? 0) < 0 ? "text-red-600" : ""}`}>{pct(r.margin_pct as number | null)}</td>
                  <td className={`px-4 py-2 text-right text-xs ${Number(r.budget_utilization ?? 0) > 100 ? "text-red-600" : "text-muted-foreground"}`}>
                    {pct(r.budget_utilization as number | null)}
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
