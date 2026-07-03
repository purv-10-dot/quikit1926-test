import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    // On-hand value = remaining FIFO cost layers; fall back to last cost when an
    // item was stocked before FIFO layers existed.
    const rows = (await prisma.$queryRaw`
      SELECT i.sku, i.name, i.quantity_on_hand AS qty,
        COALESCE(
          (SELECT SUM(sl.remaining_qty * sl.unit_cost) FROM stock_layers sl WHERE sl.org_id = i.org_id AND sl.item_id = i.id),
          i.quantity_on_hand * i.purchase_price
        ) AS value
      FROM items i
      WHERE i.org_id = ${orgId}::uuid AND i.track_inventory = true
      ORDER BY i.sku
    `) as Array<{ sku: string; name: string; qty: unknown; value: unknown }>;

    let totalQty = 0;
    let totalValue = 0;
    const reportRows = rows.map((row) => {
      const qty = Number(row.qty ?? 0);
      const value = Number(row.value ?? 0);
      totalQty += qty;
      totalValue += value;
      return {
        id: row.sku,
        sku: row.sku,
        name: row.name,
        quantity: qty,
        avg_cost: qty !== 0 ? Number((value / qty).toFixed(2)) : 0,
        value: Number(value.toFixed(2))
      };
    });

    return ok({
      key: "stock-valuation",
      title: "Stock Valuation",
      description: "On-hand quantity and value per item from FIFO cost layers.",
      apiPath: "/api/v1/reports/stock-valuation",
      columns: [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Item" },
        { key: "quantity", label: "Qty", kind: "number" },
        { key: "avg_cost", label: "Avg cost", kind: "money" },
        { key: "value", label: "Value", kind: "money" }
      ],
      rows: reportRows,
      summary: [
        { label: "Items", value: reportRows.length, tone: "neutral", kind: "number" },
        { label: "Total quantity", value: Number(totalQty.toFixed(2)), tone: "neutral", kind: "number" },
        { label: "Total value", value: Number(totalValue.toFixed(2)), tone: "good" }
      ]
    });
  } catch (error) {
    return fail(500, { code: "REPORT_FAILED", message: errorMessage(error) });
  }
}
