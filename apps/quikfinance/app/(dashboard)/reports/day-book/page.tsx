"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function DayBookPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["day-book", date],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/day-book?date=${date}`);
      return res.json();
    }
  });

  const d = data?.data ?? {};
  const summary = d.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Day Book", "Day Book")}
        description="All financial activity for a single day — journal entries, invoices, bills, payments, and expenses."
      />

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Debits</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_debits ?? 0)}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Credits</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_credits ?? 0)}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Invoices</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.invoice_count ?? 0}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Bills</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.bill_count ?? 0}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Payments</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.payment_count ?? 0}</p></CardContent></Card>
          </div>

          {(d.journal_entries ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Journal Entries</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Reference</th>
                      <th className="text-left px-4 py-2 font-medium">Memo</th>
                      <th className="text-right px-4 py-2 font-medium">Debits</th>
                      <th className="text-right px-4 py-2 font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(d.journal_entries ?? []).map((je: Record<string, unknown>) => {
                      const lines = (je.journal_entry_lines as Record<string, unknown>[]) ?? [];
                      const totalDr = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
                      const totalCr = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
                      return (
                        <tr key={String(je.id)} className="hover:bg-muted/30">
                          <td className="px-4 py-2">{String(je.reference ?? "—")}</td>
                          <td className="px-4 py-2 text-muted-foreground">{String(je.memo ?? "")}</td>
                          <td className="px-4 py-2 text-right">{fmt(totalDr)}</td>
                          <td className="px-4 py-2 text-right">{fmt(totalCr)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(d.invoices ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Invoices</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Invoice</th>
                      <th className="text-left px-4 py-2 font-medium">Customer</th>
                      <th className="text-right px-4 py-2 font-medium">Total</th>
                      <th className="text-center px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(d.invoices ?? []).map((inv: Record<string, unknown>) => {
                      const c = inv.contacts as Record<string, unknown>;
                      return (
                        <tr key={String(inv.id)} className="hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{String(inv.invoice_number)}</td>
                          <td className="px-4 py-2">{c ? String(c.display_name) : "—"}</td>
                          <td className="px-4 py-2 text-right">{fmt(Number(inv.total))}</td>
                          <td className="px-4 py-2 text-center"><Badge variant="secondary">{String(inv.status)}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(d.invoices ?? []).length === 0 && (d.journal_entries ?? []).length === 0 && (d.bills ?? []).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">No activity on {date}.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
