import type { PurchaseOrderInput } from "@/lib/validations/commercial.schema";
import { Prisma } from "@prisma/client";
import { round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

type Tx = Prisma.TransactionClient;

type ComputedLine = {
  item_id: string | null;
  account_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  discount: number;
  line_total: number;
};

function computeTotals(input: PurchaseOrderInput): { subtotal: number; discount_total: number; total: number; lines: ComputedLine[] } {
  const items = input.line_items ?? [];
  const adjustment = round2(input.adjustment ?? 0);
  if (items.length === 0) {
    const subtotal = round2(input.subtotal ?? 0);
    return { subtotal, discount_total: 0, total: round2(subtotal + adjustment), lines: [] };
  }
  let subtotal = 0;
  let discountTotal = 0;
  const lines: ComputedLine[] = items.map((item) => {
    const gross = round2(item.quantity * item.rate);
    const discount = round2(item.discount ?? 0);
    subtotal = round2(subtotal + gross);
    discountTotal = round2(discountTotal + discount);
    return { item_id: item.item_id ?? null, account_id: item.account_id ?? null, description: item.description, quantity: item.quantity, rate: item.rate, discount, line_total: round2(gross - discount) };
  });
  return { subtotal, discount_total: discountTotal, total: round2(subtotal - discountTotal + adjustment), lines };
}

/** Create or update a purchase order with its line items and recomputed totals. */
export async function savePurchaseOrder(tx: Tx, orgId: string, userId: string | null, input: PurchaseOrderInput, purchaseOrderId?: string): Promise<{ id: string }> {
  const totals = computeTotals(input);
  const adjustment = round2(input.adjustment ?? 0);
  const deliveryDate = input.expected_delivery_date ?? null;
  const dueDate = deliveryDate ?? input.due_date ?? input.issue_date;

  let id = purchaseOrderId ?? "";
  if (purchaseOrderId) {
    await tx.$executeRaw`
      UPDATE purchase_orders SET
        contact_id = ${input.contact_id}::uuid,
        status = ${input.status},
        issue_date = ${input.issue_date}::date,
        due_date = ${dueDate}::date,
        expected_delivery_date = ${deliveryDate}::date,
        reference_number = ${input.reference_number ?? null},
        payment_terms = ${input.payment_terms ?? null},
        delivery_method = ${input.delivery_method ?? null},
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        currency = ${input.currency},
        subtotal = ${totals.subtotal},
        discount_total = ${totals.discount_total},
        tax_total = 0,
        adjustment = ${adjustment},
        total = ${totals.total},
        terms = ${input.terms ?? null},
        notes = ${input.notes ?? null},
        updated_at = now()
      WHERE id = ${purchaseOrderId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM purchase_order_lines WHERE purchase_order_id = ${purchaseOrderId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const number =
      input.purchase_order_number && input.purchase_order_number.length > 0
        ? input.purchase_order_number
        : await nextDocumentNumber(tx, orgId, "purchase_order", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO purchase_orders (
        org_id, contact_id, purchase_order_number, status, issue_date, due_date, expected_delivery_date, reference_number,
        payment_terms, delivery_method, warehouse_id, currency, subtotal, discount_total, tax_total,
        adjustment, total, terms, notes, created_by
      ) VALUES (
        ${orgId}::uuid, ${input.contact_id}::uuid, ${number}, ${input.status}, ${input.issue_date}::date, ${dueDate}::date,
        ${deliveryDate}::date, ${input.reference_number ?? null}, ${input.payment_terms ?? null}, ${input.delivery_method ?? null},
        ${input.warehouse_id ?? null}::uuid, ${input.currency}, ${totals.subtotal}, ${totals.discount_total},
        0, ${adjustment}, ${totals.total}, ${input.terms ?? null}, ${input.notes ?? null}, ${userId ? userId : null}::uuid
      ) RETURNING id`;
    id = rows[0].id;
  }

  let order = 0;
  for (const line of totals.lines) {
    await tx.$executeRaw`
      INSERT INTO purchase_order_lines (org_id, purchase_order_id, item_id, account_id, description, quantity, rate, discount, tax_amount, line_total, display_order)
      VALUES (
        ${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid,
        ${line.description}, ${line.quantity}, ${line.rate}, ${line.discount}, 0, ${line.line_total}, ${order}
      )`;
    order += 1;
  }
  return { id };
}
