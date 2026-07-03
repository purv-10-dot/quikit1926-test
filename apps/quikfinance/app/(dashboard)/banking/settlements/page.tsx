"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

function fmt(v: number) {
  return formatMoneyDigits(v, 2);
}

export default function SettlementsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", status],
    queryFn: async () => {
      const url = status === "all" ? "/api/v1/banking/settlements?limit=100" : `/api/v1/banking/settlements?status=${status}&limit=100`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const totalGross = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.gross_amount ?? 0), 0);
  const totalFees = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.fees_amount ?? 0), 0);
  const totalNet = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.net_amount ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Settlements", "Gateway Settlements")}
        description="Razorpay settlement accounting. Each settlement is posted as a journal entry moving funds from the gateway clearing account to your bank."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gross Collected</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(totalGross)}</p></CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Gateway Fees</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalFees)}</p></CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Net Settled</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(totalNet)}</p></CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {["all", "pending", "processed", "exception"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Settlement ID</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Bank Account</th>
              <th className="text-right px-4 py-3 font-medium">Gross</th>
              <th className="text-right px-4 py-3 font-medium">Fees</th>
              <th className="text-right px-4 py-3 font-medium">Net</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="font-medium">No settlements found.</p>
                  <p className="text-xs mt-1">Razorpay settlements are created automatically from webhook data.</p>
                </td>
              </tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const bank = r.bank_accounts as Record<string, unknown>;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{String(r.provider_settlement_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(r.settlement_date)}</td>
                  <td className="px-4 py-3">{bank ? String(bank.name) : "—"}</td>
                  <td className="px-4 py-3 text-right">{fmt(Number(r.gross_amount))}</td>
                  <td className="px-4 py-3 text-right text-red-600">{fmt(Number(r.fees_amount))}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-700">{fmt(Number(r.net_amount))}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={r.status === "processed" ? "default" : r.status === "exception" ? "destructive" : "secondary"}>
                      {String(r.status)}
                    </Badge>
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
