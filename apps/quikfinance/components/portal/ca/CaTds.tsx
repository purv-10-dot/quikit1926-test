"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Tds = {
  rows: Array<{ vendor: string; gstin: string | null; pan: string | null; bills: number; tds: string; gross: string }>;
  totals: { tds: number; gross: number; deductees: number };
};

export function CaTds() {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["ca-tds"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/ca/tds");
      return r.ok ? ((await r.json()).data as Tds) : null;
    }
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="TDS / TCS" description="Tax deducted at source on the selected company's vendor bills" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Total TDS deducted" value={format(data?.totals.tds ?? 0)} tone="amber" loading={isPending} />
        <Kpi label="On gross value" value={format(data?.totals.gross ?? 0)} loading={isPending} />
        <Kpi label="Deductees" value={data?.totals.deductees ?? 0} loading={isPending} />
      </div>
      <WidgetCard title="TDS by deductee">
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No TDS recorded" hint="TDS withheld on vendor bills will be summarised here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-2.5 text-left">Deductee</th><th className="px-5 py-2.5 text-left">PAN</th><th className="px-5 py-2.5 text-right">Bills</th><th className="px-5 py-2.5 text-right">Gross</th><th className="px-5 py-2.5 text-right">TDS</th></tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5 font-medium">{r.vendor}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{r.pan ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.bills}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(r.gross))}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-amber-600">{format(Number(r.tds))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
