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

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function CustomerStatementPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const fy = `${new Date().getFullYear()}-04-01`;
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [contactId, setContactId] = useState("");

  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/customers?limit=200");
      return res.json();
    }
  });

  const { data, isLoading } = useQuery({
    queryKey: ["customer-statement", contactId, from, to],
    enabled: !!contactId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/customer-statement?contact_id=${contactId}&from=${from}&to=${to}`);
      return res.json();
    }
  });

  const customers = customersData?.data ?? [];
  const d = data?.data ?? {};
  const summary = d.summary ?? {};
  const transactions = d.transactions ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Customer Statement" description="Full transaction history and running balance for a customer." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Customer</Label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm w-72" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Select customer...</option>
            {customers.map((c: Record<string, unknown>) => (
              <option key={String(c.id)} value={String(c.id)}>{String(c.display_name)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {!contactId && (
        <div className="text-center py-16 text-muted-foreground">Select a customer to view their statement.</div>
      )}

      {contactId && !isLoading && d.contact && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Invoiced</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_invoiced ?? 0)}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Paid</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-green-600">{fmt(summary.total_paid ?? 0)}</p></CardContent></Card>
            <Card className="border-amber-200"><CardHeader className="pb-1"><CardTitle className="text-xs text-amber-600">Outstanding</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-amber-600">{fmt(summary.total_outstanding ?? 0)}</p></CardContent></Card>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Reference</th>
                  <th className="text-left px-4 py-3 font-medium">Due Date</th>
                  <th className="text-right px-4 py-3 font-medium">Debit</th>
                  <th className="text-right px-4 py-3 font-medium">Credit</th>
                  <th className="text-right px-4 py-3 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx: Record<string, unknown>, i: number) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground">{String(tx.date)}</td>
                    <td className="px-4 py-2"><Badge variant={tx.type === "invoice" ? "outline" : "secondary"}>{String(tx.type)}</Badge></td>
                    <td className="px-4 py-2 font-medium">{String(tx.reference ?? "—")}</td>
                    <td className="px-4 py-2 text-muted-foreground">{tx.due_date ? String(tx.due_date) : "—"}</td>
                    <td className="px-4 py-2 text-right">{Number(tx.debit) > 0 ? fmt(Number(tx.debit)) : "—"}</td>
                    <td className="px-4 py-2 text-right text-green-600">{Number(tx.credit) > 0 ? fmt(Number(tx.credit)) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(tx.running_balance) > 0 ? "text-amber-600" : ""}`}>
                      {fmt(Number(tx.running_balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => {
              const header = ["Date,Type,Reference,Debit,Credit,Balance"];
              const csvRows = transactions.map((tx: Record<string, unknown>) =>
                [tx.date, tx.type, tx.reference, tx.debit, tx.credit, tx.running_balance].join(",")
              );
              const csv = [...header, ...csvRows].join("\n");
              const a = document.createElement("a");
              a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
              a.download = `customer-statement-${contactId}.csv`;
              a.click();
            }}>Export CSV</Button>
          </div>
        </>
      )}
    </div>
  );
}
