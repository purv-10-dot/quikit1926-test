"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function GstCommandCenterPage() {
  const { t } = useI18n();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["gst-command-center", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tax/gst-command-center?month=${month}&year=${year}`);
      return res.json();
    }
  });

  const d = data?.data ?? {};
  const summary = d.summary ?? {};
  const returns = d.returns ?? {};
  const status = d.status ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.GST Command Center", "GST Command Center")}
        description="Period-level GST overview. Monitor output tax, input tax credit, net payable, and filing status across GSTR-1, GSTR-3B, and GSTR-2B."
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taxable Sales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{fmt(summary.taxable_sales ?? 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Output GST</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(summary.output_gst ?? 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Input Tax Credit</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-green-600">{fmt(summary.input_gst ?? 0)}</p></CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">Net GST Payable</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(summary.net_payable ?? 0)}</p></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "GSTR-1", desc: "Outward supplies", filed: status.gstr1_filed, href: "/reports/gstr-1", key: "gstr1" },
              { label: "GSTR-3B", desc: "Monthly summary return", filed: status.gstr3b_filed, href: "/reports/gstr-3b", key: "gstr3b" },
              { label: "GSTR-2B Recon", desc: "ITC reconciliation", filed: status.gstr2b_available, href: "/tax/gstr2b", key: "gstr2b" }
            ].map((r) => (
              <Card key={r.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{r.label}</CardTitle>
                    <Badge variant={r.filed ? "default" : "secondary"}>{r.filed ? "Filed / Available" : "Pending"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.desc}</p>
                </CardHeader>
                <CardContent>
                  {returns[r.key] && (
                    <p className="text-sm text-muted-foreground mb-3">
                      Total Tax: {fmt(Number(returns[r.key]?.total_igst ?? 0))}
                    </p>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={r.href}>{r.filed ? "View" : "Prepare"}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">GST Checklist — {MONTHS[month - 1]} {year}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "All sales invoices posted with HSN/SAC codes", done: (summary.taxable_sales ?? 0) > 0 },
                { label: "Input tax credit claimed on all bills", done: (summary.input_gst ?? 0) > 0 },
                { label: "GSTR-1 filed", done: status.gstr1_filed },
                { label: "GSTR-2B reconciled", done: status.gstr2b_available },
                { label: "GSTR-3B filed", done: status.gstr3b_filed }
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${item.done ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {item.done ? "✓" : "○"}
                  </span>
                  <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
