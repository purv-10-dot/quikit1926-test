"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  received: "default",
  billed: "outline",
  cancelled: "destructive"
};

export default function GoodsReceiptsPage() {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const res = await fetch("/api/v1/goods-receipts?limit=100");
      return res.json();
    }
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Goods Receipts", "Goods Receipts")}
        description="Record goods received against purchase orders. GRNs update inventory and link to vendor bills."
        actionLabel="New GRN"
        actionHref="/goods-receipts/new"
      />

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">GRN Number</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 font-medium">PO Reference</th>
              <th className="text-left px-4 py-3 font-medium">Warehouse</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                <p className="font-medium">No goods receipts yet.</p>
                <p className="text-xs mt-1">Record received goods against purchase orders to update inventory.</p>
              </td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const vendor = r.contacts as Record<string, unknown>;
              const warehouse = r.warehouses as Record<string, unknown>;
              const po = r.purchase_orders as Record<string, unknown>;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/goods-receipts/${r.id}`} className="font-medium text-primary hover:underline">
                      {String(r.grn_number)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{String(r.receipt_date)}</td>
                  <td className="px-4 py-3">{String(vendor?.display_name ?? "—")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{po ? String(po.purchase_order_number) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{warehouse ? String(warehouse.name) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_COLORS[String(r.status)] ?? "secondary"}>
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
