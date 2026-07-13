"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  in_transit: "outline",
  received: "default",
  cancelled: "destructive"
};

export default function StockTransfersPage() {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const res = await fetch("/api/v1/stock-transfers?limit=100");
      return res.json();
    }
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Transfers", "Stock Transfers")}
        description="Move inventory between warehouses. Transfers deduct from source and add to destination upon receipt."
        actionLabel="New Transfer"
        actionHref="/inventory/transfers/new"
      />

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Transfer #</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">From</th>
              <th className="text-left px-4 py-3 font-medium">To</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                <p className="font-medium">No transfers yet.</p>
                <p className="text-xs mt-1">Create a transfer to move inventory between warehouses.</p>
              </td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const from = r.from_wh as Record<string, unknown>;
              const to = r.to_wh as Record<string, unknown>;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{String(r.transfer_number)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(r.transfer_date)}</td>
                  <td className="px-4 py-3">{from ? String(from.name) : "—"}</td>
                  <td className="px-4 py-3">{to ? String(to.name) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_COLORS[String(r.status)] ?? "secondary"}>{String(r.status)}</Badge>
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
