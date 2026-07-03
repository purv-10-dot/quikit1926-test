"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMoney } from "@/lib/utils/currency";

type GrnLine = { id: string; item_name: string | null; sku: string | null; qty_received: string; unit_cost: string; total_cost: string };
type Grn = { grn_number?: string; vendor_name?: string; receipt_date?: string; status?: string; bill_id?: string | null; lines?: GrnLine[] };

export default function GoodsReceiptDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery<Grn | null>({
    queryKey: ["goods-receipt", params.id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/goods-receipts/${params.id}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: Grn };
      return payload.data ?? null;
    }
  });

  const convert = async () => {
    const response = await fetch(`/api/v1/goods-receipts/${params.id}/bill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_total: 0 })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast.error(body?.error?.message ?? "Could not convert to bill.");
      return;
    }
    toast.success("Vendor bill created from goods receipt.");
    queryClient.invalidateQueries({ queryKey: ["goods-receipt", params.id] });
    router.push("/bills");
  };

  if (!data) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const lines = data.lines ?? [];
  const total = lines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0);
  const alreadyBilled = Boolean(data.bill_id);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={`Goods receipt ${data.grn_number ?? ""}`} description={`${data.vendor_name ?? "Vendor"} · ${data.receipt_date ?? ""}`} />
        <div className="flex items-center gap-3">
          {data.status ? <StatusBadge status={data.status} /> : null}
          <Button onClick={convert} disabled={alreadyBilled || data.status === "draft"}>
            {alreadyBilled ? "Billed" : "Convert to bill"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Received items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-3 py-2">{line.item_name ?? line.sku ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(line.qty_received)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(line.unit_cost))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(line.total_cost))}</td>
                </tr>
              ))}
              <tr className="border-t font-bold">
                <td className="px-3 py-2" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
