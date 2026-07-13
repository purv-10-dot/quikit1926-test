"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
}

export default function StockValuationPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/v1/warehouses");
      return res.json();
    }
  });

  const { data, isLoading } = useQuery({
    queryKey: ["stock-valuation", asOf, warehouseId],
    queryFn: async () => {
      let url = `/api/v1/reports/stock-valuation?as_of=${asOf}`;
      if (warehouseId) url += `&warehouse_id=${warehouseId}`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const rows = (data?.data ?? []).filter((r: Record<string, unknown>) => {
    if (!search) return true;
    const item = r.items as Record<string, unknown>;
    return String(item?.name ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const meta = data?.meta ?? {};
  const summary = meta.summary ?? {};
  const warehouses = warehousesData?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Stock Valuation" description="Current inventory quantity and value across all items and warehouses." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label>As of Date</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Warehouse</Label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">All Warehouses</option>
            {warehouses.map((w: Record<string, unknown>) => <option key={String(w.id)} value={String(w.id)}>{String(w.name)}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>Search</Label><Input placeholder="Item name..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Items</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{summary.total_items ?? 0}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Qty</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmtQty(summary.total_qty ?? 0)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{fmt(summary.total_value ?? 0)}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Item</th>
              <th className="text-left px-4 py-3 font-medium">Warehouse</th>
              <th className="text-left px-4 py-3 font-medium">HSN/SAC</th>
              <th className="text-right px-4 py-3 font-medium">Qty</th>
              <th className="text-right px-4 py-3 font-medium">Unit Cost</th>
              <th className="text-right px-4 py-3 font-medium">Total Value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No stock movements found. Record inventory to see valuation.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>, i: number) => {
              const item = r.items as Record<string, unknown>;
              const wh = r.warehouses as Record<string, unknown>;
              return (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 font-medium">{String(item?.name ?? "—")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{wh ? String(wh.name) : "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{String(item?.hsn_sac_code ?? "—")}</td>
                  <td className="px-4 py-2 text-right">{fmtQty(Number(r.balance_qty))}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{fmt(Number(r.unit_cost))}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmt(Number(r.balance_value))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
