"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Kpi, SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Row = { id: string; date: string | null; type: "Invoice" | "Payment"; ref: string; debit: number; credit: number };

const fmtDate = (d: string | null) => (d ? new Date(String(d)).toLocaleDateString() : "—");

export function StatementView() {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["client-statement"],
    queryFn: async () => {
      const [invR, payR] = await Promise.all([
        fetch("/api/v1/portal/client/list?type=invoices").then((r) => (r.ok ? r.json() : { data: [] })),
        fetch("/api/v1/portal/client/list?type=payments").then((r) => (r.ok ? r.json() : { data: [] }))
      ]);
      const invoices = (invR.data as Array<Record<string, unknown>>).map((i) => ({ id: String(i.id), date: (i.issue_date as string) ?? null, type: "Invoice" as const, ref: String(i.invoice_number ?? "—"), debit: Number(i.total ?? 0), credit: 0 }));
      const payments = (payR.data as Array<Record<string, unknown>>).map((p) => ({ id: String(p.id), date: (p.payment_date as string) ?? null, type: "Payment" as const, ref: String(p.payment_number ?? "Payment"), debit: 0, credit: Number(p.amount ?? 0) }));
      const rows = [...invoices, ...payments].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      let bal = 0;
      const withBalance = rows.map((r) => { bal += r.debit - r.credit; return { ...r, balance: bal }; });
      const totalDebit = invoices.reduce((s, r) => s + r.debit, 0);
      const totalCredit = payments.reduce((s, r) => s + r.credit, 0);
      return { rows: withBalance, totalDebit, totalCredit, closing: bal };
    }
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Statement of Account" description="Running ledger of invoices and payments" actions={
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium shadow-card hover:text-primary"><Download className="h-4 w-4" />Export PDF</button>
      } />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Total invoiced" value={format(data?.totalDebit ?? 0)} loading={isPending} />
        <Kpi label="Total paid" value={format(data?.totalCredit ?? 0)} tone="emerald" loading={isPending} />
        <Kpi label="Closing balance" value={format(data?.closing ?? 0)} tone={(data?.closing ?? 0) > 0 ? "rose" : "emerald"} loading={isPending} />
      </div>

      <WidgetCard title="Ledger">
        {(data?.rows ?? []).length === 0 ? <EmptyState icon={FileBarChart} title="No transactions yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-2.5 text-left">Date</th><th className="px-5 py-2.5 text-left">Details</th><th className="px-5 py-2.5 text-right">Debit</th><th className="px-5 py-2.5 text-right">Credit</th><th className="px-5 py-2.5 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y">
                {data!.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5 text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="px-5 py-2.5"><span className="font-medium">{r.ref}</span><span className="ml-2 text-xs text-muted-foreground">{r.type}</span></td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.debit ? format(r.debit) : "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-emerald-600">{r.credit ? format(r.credit) : "—"}</td>
                    <td className={cn("px-5 py-2.5 text-right font-medium tabular-nums", r.balance > 0 ? "text-rose-600" : "")}>{format(r.balance)}</td>
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
