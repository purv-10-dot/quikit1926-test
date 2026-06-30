import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { purchaseOrderSchema } from "@/lib/validations/commercial.schema";
import { savePurchaseOrder } from "@/lib/accounting/purchase-order-service";
import { todayISO } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type PoRow = { contact_id: string; currency: string; reference_number: string | null; payment_terms: string | null; delivery_method: string | null; warehouse_id: string | null; adjustment: string; terms: string | null; notes: string | null };
type LineRow = { item_id: string | null; account_id: string | null; description: string; quantity: string; rate: string; discount: string; item_name: string | null };

/** Clone a purchase order into a fresh draft (new number, today's date). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT contact_id, currency, reference_number, payment_terms, delivery_method, warehouse_id, adjustment, terms, notes
      FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as PoRow[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    const po = rows[0];

    const lines = (await prisma.$queryRaw`
      SELECT pl.item_id, pl.account_id, pl.description, pl.quantity, pl.rate, pl.discount, i.name AS item_name
      FROM purchase_order_lines pl LEFT JOIN items i ON i.id = pl.item_id
      WHERE pl.purchase_order_id = ${params.id}::uuid AND pl.org_id = ${orgId}::uuid ORDER BY pl.display_order ASC
    `) as LineRow[];

    const lineItems = lines
      .map((l) => ({ description: (l.description?.trim() || l.item_name || "Item").slice(0, 2000), quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount ?? 0), item_id: l.item_id ?? null, account_id: l.account_id ?? null }))
      .filter((l) => l.quantity > 0);

    const parsed = purchaseOrderSchema.safeParse({
      contact_id: po.contact_id, issue_date: todayISO(), status: "draft", currency: po.currency?.trim() || "INR",
      reference_number: po.reference_number, payment_terms: po.payment_terms, delivery_method: po.delivery_method,
      warehouse_id: po.warehouse_id, adjustment: Number(po.adjustment ?? 0), terms: po.terms, notes: po.notes,
      subtotal: 0, total: 0, line_items: lineItems
    });
    if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not clone this purchase order.", details: parsed.error.flatten() });

    const result = await prisma.$transaction((tx) => savePurchaseOrder(tx, orgId, userId, parsed.data));
    const poRows = (await prisma.$queryRaw`SELECT purchase_order_number FROM purchase_orders WHERE id = ${result.id}::uuid`) as Array<{ purchase_order_number: string }>;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: result.id, action: "clone", new_values: { from: params.id } });
    return ok({ id: result.id, number: poRows[0]?.purchase_order_number ?? null, redirect: `/purchase-orders/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CLONE_FAILED", message: errorMessage(error) });
  }
}
