"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

const REASON_LABELS: Record<string, string> = {
  damage: "Damage",
  expiry: "Expiry",
  correction: "Correction",
  initial_stock: "Initial Stock",
  write_off: "Write-off",
  found: "Found",
  other: "Other"
};

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

export default function StockAdjustmentsPage() {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: async () => {
      const res = await fetch("/api/v1/stock-adjustments?limit=100");
      return res.json();
    }
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Adjustments", "Stock Adjustments")}
        description="Record inventory adjustments for damage, expiry, corrections, or opening balances. Each adjustment updates stock levels."
        actionLabel="New Adjustment"
        actionHref="/inventory/adjustments/new"
      />

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Adj. Number</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Warehouse</th>
              <th className="text-left px-4 py-3 font-medium">Reason</th>
              <th className="text-right px-4 py-3 font-medium">Value Change</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                <p className="font-medium">No adjustments yet.</p>
                <p className="text-xs mt-1">Create a stock adjustment to correct inventory quantities.</p>
              </td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const wh = r.warehouses as Record<string, unknown>;
              const vc = Number(r.total_value_change ?? 0);
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{String(r.adjustment_number)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(r.adjustment_date)}</td>
                  <td className="px-4 py-3">{wh ? String(wh.name) : "—"}</td>
                  <td className="px-4 py-3">{REASON_LABELS[String(r.reason)] ?? String(r.reason)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${vc < 0 ? "text-red-600" : "text-green-600"}`}>
                    {vc >= 0 ? "+" : ""}{fmt(vc)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={r.status === "confirmed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>
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
