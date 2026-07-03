"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function SalesRegisterPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const fy = `${new Date().getFullYear()}-04-01`;
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-register", from, to, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/sales-register?from=${from}&to=${to}&page=${page}&limit=100`);
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const summary = meta.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Sales Register" description="All invoices for the selected period with GST breakup." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
        <Button variant="outline" size="sm" onClick={() => {
          const csv = ["Invoice,Customer,GSTIN,Date,Taxable,Tax,Total,Balance,Status"].concat(
            rows.map((r: Record<string, unknown>) => {
              const c = r.contacts as Record<string, unknown>;
              return [r.invoice_number, c?.display_name, c?.tax_id, r.issue_date, r.subtotal, r.tax_total, r.total, r.balance_due, r.status].join(",");
            })
          ).join("\n");
          const a = document.createElement("a");
          a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
          a.download = `sales-register-${from}-${to}.csv`;
          a.click();
        }}>Export CSV</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Invoices</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.invoice_count ?? 0}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Taxable Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_taxable ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Tax</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_tax ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Invoiced</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_invoiced ?? 0)}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Invoice</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">GSTIN</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Taxable</th>
              <th className="text-right px-4 py-3 font-medium">Tax</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No invoices in this period.</td></tr>}
            {rows.map((r: Record<string, unknown>) => {
              const c = r.contacts as Record<string, unknown>;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2"><Link href={`/invoices/${r.id}`} className="text-primary hover:underline font-medium">{String(r.invoice_number)}</Link></td>
                  <td className="px-4 py-2">{String(c?.display_name ?? "—")}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{String(c?.tax_id ?? "—")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{String(r.issue_date)}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.subtotal))}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.tax_total))}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmt(Number(r.total))}</td>
                  <td className="px-4 py-2 text-center"><Badge variant="secondary">{String(r.status)}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{meta.total ?? 0} invoices</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="px-2 py-1">Page {page}</span>
          <Button size="sm" variant="outline" disabled={rows.length < 100} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
