"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

type Bucket = "all" | "overdue" | "due_soon" | "outstanding";

const BUCKETS: { label: string; value: Bucket; color: string }[] = [
  { label: "All Outstanding", value: "all", color: "secondary" },
  { label: "Overdue", value: "overdue", color: "destructive" },
  { label: "Due This Week", value: "due_soon", color: "warning" },
  { label: "Not Yet Due", value: "outstanding", color: "default" }
];

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function ReceivablesPage() {
  const { t } = useI18n();
  const [bucket, setBucket] = useState<Bucket>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["receivables", bucket],
    queryFn: async () => {
      const url = bucket === "all" ? "/api/v1/receivables?limit=100" : `/api/v1/receivables?bucket=${bucket}&limit=100`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const rows = (data?.data ?? []).filter((r: Record<string, unknown>) => {
    if (!search) return true;
    const name = String((r.contacts as Record<string, unknown>)?.display_name ?? "").toLowerCase();
    const num = String(r.invoice_number ?? "").toLowerCase();
    return name.includes(search.toLowerCase()) || num.includes(search.toLowerCase());
  });

  const summary = data?.meta?.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Receivables", "Receivables")}
        description="Monitor customer balances, aging buckets, and collection status."
        actionLabel="New Invoice"
        actionHref="/invoices/new"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(summary.total_outstanding ?? 0)}</p></CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{summary.overdue_count ?? 0} invoices</p></CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">Due This Week</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{summary.due_soon_count ?? 0} invoices</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {BUCKETS.map((b) => (
          <Button
            key={b.value}
            size="sm"
            variant={bucket === b.value ? "default" : "outline"}
            onClick={() => setBucket(b.value)}
          >
            {b.label}
          </Button>
        ))}
        <Input
          placeholder="Search customer or invoice..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto w-60"
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Invoice</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Due Date</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-right px-4 py-3 font-medium">Balance Due</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Days Overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No outstanding receivables.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const contact = r.contacts as Record<string, unknown>;
              const ab = r.aging_bucket as string;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${r.id}`} className="font-medium text-primary hover:underline">
                      {String(r.invoice_number)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{String(contact?.display_name ?? "—")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(r.due_date)}</td>
                  <td className="px-4 py-3 text-right">{fmt(Number(r.total))}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(Number(r.balance_due))}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={ab === "overdue" ? "destructive" : ab === "due_soon" ? "outline" : "secondary"}>
                      {ab === "overdue" ? "Overdue" : ab === "due_soon" ? "Due Soon" : "Outstanding"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {Number(r.days_overdue) > 0 ? <span className="text-red-600 font-medium">{String(r.days_overdue)}d</span> : "—"}
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
