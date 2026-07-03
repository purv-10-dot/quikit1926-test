import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { round2 } from "@/lib/accounting/posting";
import { todayISO, addDaysISO } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type SoRow = { contact_id: string; sales_order_number: string; currency: string; subtotal: string; total: string; notes: string | null; terms: string | null };
type LineRow = { item_id: string | null; account_id: string | null; description: string; quantity: string; rate: string; discount: string; item_name: string | null };

/** Convert a sales order into a draft invoice, carrying its line items. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT contact_id, sales_order_number, currency, subtotal, total, notes, terms FROM sales_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as SoRow[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Sales order was not found." });
    const so = rows[0];

    const lines = (await prisma.$queryRaw`
      SELECT sl.item_id, sl.account_id, sl.description, sl.quantity, sl.rate, sl.discount, i.name AS item_name
      FROM sales_order_lines sl LEFT JOIN items i ON i.id = sl.item_id
      WHERE sl.sales_order_id = ${params.id}::uuid AND sl.org_id = ${orgId}::uuid ORDER BY sl.display_order ASC
    `) as LineRow[];

    const lineItems = lines
      .map((l) => ({ description: (l.description?.trim() || l.item_name || "Item").slice(0, 500), quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount ?? 0), item_id: l.item_id ?? null, account_id: l.account_id ?? null }))
      .filter((l) => l.quantity > 0);
    if (lineItems.length === 0) return fail(400, { code: "NO_LINES", message: "This sales order has no line items to invoice." });

    const parsed = invoiceSchema.safeParse({
      contact_id: so.contact_id, order_number: so.sales_order_number, issue_date: todayISO(), due_date: addDaysISO(30), status: "draft",
      currency: so.currency?.trim() || "INR", subtotal: round2(Number(so.subtotal ?? 0)), total: round2(Number(so.total ?? 0)),
      balance_due: round2(Number(so.total ?? 0)), notes: so.notes, terms: so.terms ? so.terms.slice(0, 1000) : null, line_items: lineItems
    });
    if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not build an invoice from this sales order.", details: parsed.error.flatten() });

    const result = await prisma.$transaction(async (tx) => {
      const inv = await saveInvoice(tx, orgId, userId, parsed.data);
      await tx.$executeRaw`UPDATE sales_orders SET status = 'invoiced', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return inv;
    });
    const invRows = (await prisma.$queryRaw`SELECT invoice_number FROM invoices WHERE id = ${result.id}::uuid`) as Array<{ invoice_number: string }>;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: params.id, action: "convert", new_values: { to: "invoice", invoice_id: result.id } });
    return ok({ id: result.id, number: invRows[0]?.invoice_number ?? null, redirect: `/invoices/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
