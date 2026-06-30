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

export default function PurchaseRegisterPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const fy = `${new Date().getFullYear()}-04-01`;
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-register", from, to, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/purchase-register?from=${from}&to=${to}&page=${page}&limit=100`);
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const summary = meta.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Purchase Register" description="All vendor bills for the selected period with GST and TDS breakup." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Bills</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.bill_count ?? 0}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Taxable Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_taxable ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Tax</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_tax ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">TDS Deducted</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_tds ?? 0)}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Bill</th>
              <th className="text-left px-4 py-3 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 font-medium">GSTIN</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Taxable</th>
              <th className="text-right px-4 py-3 font-medium">Tax</th>
              <th className="text-right px-4 py-3 font-medium">TDS</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No bills in this period.</td></tr>}
            {rows.map((r: Record<string, unknown>) => {
              const c = r.contacts as Record<string, unknown>;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2"><Link href={`/bills/${r.id}`} className="text-primary hover:underline font-medium">{String(r.bill_number)}</Link></td>
                  <td className="px-4 py-2">{String(c?.display_name ?? "—")}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{String(c?.tax_id ?? "—")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{String(r.issue_date)}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.subtotal))}</td>
                  <td className="px-4 py-2 text-right">{fmt(Number(r.tax_total))}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{fmt(Number(r.tds_amount ?? 0))}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmt(Number(r.total))}</td>
                  <td className="px-4 py-2 text-center"><Badge variant="secondary">{String(r.status)}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{meta.total ?? 0} bills</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="px-2 py-1">Page {page}</span>
          <Button size="sm" variant="outline" disabled={rows.length < 100} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
