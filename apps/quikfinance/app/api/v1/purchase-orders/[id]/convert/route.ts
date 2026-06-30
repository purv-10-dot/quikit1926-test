import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { billSchema } from "@/lib/validations/bill.schema";
import { saveBill } from "@/lib/accounting/bill-service";
import { round2 } from "@/lib/accounting/posting";
import { todayISO, addDaysISO } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type PoRow = { contact_id: string; purchase_order_number: string; currency: string; subtotal: string; total: string; reference_number: string | null; notes: string | null; bill_id: string | null };
type LineRow = { item_id: string | null; account_id: string | null; description: string; quantity: string; rate: string; discount: string; item_name: string | null };

/** Convert a purchase order into a draft vendor bill, carrying its line items (Zoho: Convert to Bill). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT contact_id, purchase_order_number, currency, subtotal, total, reference_number, notes, bill_id
      FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as PoRow[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    const po = rows[0];
    if (po.bill_id) return fail(409, { code: "ALREADY_BILLED", message: "This purchase order has already been converted to a bill.", details: { bill_id: po.bill_id } });

    const lines = (await prisma.$queryRaw`
      SELECT pl.item_id, pl.account_id, pl.description, pl.quantity, pl.rate, pl.discount, i.name AS item_name
      FROM purchase_order_lines pl LEFT JOIN items i ON i.id = pl.item_id
      WHERE pl.purchase_order_id = ${params.id}::uuid AND pl.org_id = ${orgId}::uuid ORDER BY pl.display_order ASC
    `) as LineRow[];

    const lineItems = lines
      .map((l) => ({ description: (l.description?.trim() || l.item_name || "Item").slice(0, 500), quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount ?? 0), item_id: l.item_id ?? null, account_id: l.account_id ?? null }))
      .filter((l) => l.quantity > 0);
    if (lineItems.length === 0) return fail(400, { code: "NO_LINES", message: "This purchase order has no line items to bill." });

    const total = round2(Number(po.total ?? 0));
    const parsed = billSchema.safeParse({
      contact_id: po.contact_id, order_number: po.purchase_order_number, vendor_reference: po.reference_number,
      issue_date: todayISO(), due_date: addDaysISO(30), status: "draft", currency: po.currency?.trim() || "INR",
      subtotal: round2(Number(po.subtotal ?? 0)), discount_total: 0, tax_total: 0, total, balance_due: total,
      notes: po.notes, line_items: lineItems
    });
    if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not build a bill from this purchase order.", details: parsed.error.flatten() });

    const result = await prisma.$transaction(async (tx) => {
      const bill = await saveBill(tx, orgId, userId, parsed.data);
      await tx.$executeRaw`UPDATE purchase_orders SET status = 'billed', bill_id = ${bill.id}::uuid, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return bill;
    });
    const billRows = (await prisma.$queryRaw`SELECT bill_number FROM bills WHERE id = ${result.id}::uuid`) as Array<{ bill_number: string }>;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "convert", new_values: { to: "bill", bill_id: result.id } });
    return ok({ id: result.id, number: billRows[0]?.bill_number ?? null, redirect: `/bills/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
