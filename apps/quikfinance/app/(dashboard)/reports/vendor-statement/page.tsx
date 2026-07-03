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

export default function VendorStatementPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const fy = `${new Date().getFullYear()}-04-01`;
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [contactId, setContactId] = useState("");

  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/vendors?limit=200");
      return res.json();
    }
  });

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-statement", contactId, from, to],
    enabled: !!contactId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/vendor-statement?contact_id=${contactId}&from=${from}&to=${to}`);
      return res.json();
    }
  });

  const vendors = vendorsData?.data ?? [];
  const d = data?.data ?? {};
  const summary = d.summary ?? {};
  const transactions = d.transactions ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Vendor Statement" description="Full transaction history and running balance for a vendor." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Vendor</Label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm w-72" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Select vendor...</option>
            {vendors.map((v: Record<string, unknown>) => (
              <option key={String(v.id)} value={String(v.id)}>{String(v.display_name)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {!contactId && (
        <div className="text-center py-16 text-muted-foreground">Select a vendor to view their statement.</div>
      )}

      {contactId && !isLoading && d.contact && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Billed</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_billed ?? 0)}</p></CardContent></Card>
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
                  <th className="text-right px-4 py-3 font-medium">Debit</th>
                  <th className="text-right px-4 py-3 font-medium">Credit</th>
                  <th className="text-right px-4 py-3 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx: Record<string, unknown>, i: number) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground">{String(tx.date)}</td>
                    <td className="px-4 py-2"><Badge variant="secondary">{String(tx.type)}</Badge></td>
                    <td className="px-4 py-2 font-medium">{String(tx.reference ?? "—")}</td>
                    <td className="px-4 py-2 text-right text-green-600">{Number(tx.debit) > 0 ? fmt(Number(tx.debit)) : "—"}</td>
                    <td className="px-4 py-2 text-right">{Number(tx.credit) > 0 ? fmt(Number(tx.credit)) : "—"}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(Number(tx.running_balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
