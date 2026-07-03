import { Prisma } from "@prisma/client";
import type { QuotationInput } from "@/lib/validations/commercial.schema";
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

type ComputedTotals = { subtotal: number; discount_total: number; total: number; lines: ComputedLine[] };

/** Server-authoritative totals from the line items (quotes carry no tax line). */
function computeTotals(input: QuotationInput): ComputedTotals {
  const items = input.line_items ?? [];
  const adjustment = round2(input.adjustment ?? 0);

  if (items.length === 0) {
    // Back-compat: trust header amounts when no lines are sent.
    const subtotal = round2(input.subtotal ?? 0);
    return { subtotal, discount_total: 0, total: round2(subtotal + adjustment), lines: [] };
  }

  let subtotal = 0;
  let discountTotal = 0;
  const lines: ComputedLine[] = items.map((item) => {
    const gross = round2(item.quantity * item.rate);
    const discount = round2(item.discount ?? 0);
    const net = round2(gross - discount);
    subtotal = round2(subtotal + gross);
    discountTotal = round2(discountTotal + discount);
    return {
      item_id: item.item_id ?? null,
      account_id: item.account_id ?? null,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      discount,
      line_total: net
    };
  });

  return { subtotal, discount_total: discountTotal, total: round2(subtotal - discountTotal + adjustment), lines };
}

/**
 * Create or update a quote with its line items and recomputed totals.
 * `expiry_date` is stored separately; `due_date` (NOT NULL) falls back to it
 * or the issue date. Runs inside the caller's transaction.
 */
export async function saveQuotation(
  tx: Tx,
  orgId: string,
  userId: string | null,
  input: QuotationInput,
  quotationId?: string
): Promise<{ id: string }> {
  const totals = computeTotals(input);
  const adjustment = round2(input.adjustment ?? 0);
  const expiry = input.expiry_date ?? null;
  const dueDate = expiry ?? input.due_date ?? input.issue_date;

  let id = quotationId ?? "";
  if (quotationId) {
    await tx.$executeRaw`
      UPDATE quotations SET
        contact_id = ${input.contact_id}::uuid,
        status = ${input.status},
        issue_date = ${input.issue_date}::date,
        due_date = ${dueDate}::date,
        expiry_date = ${expiry}::date,
        reference_number = ${input.reference_number ?? null},
        salesperson = ${input.salesperson ?? null},
        project_id = ${input.project_id ?? null}::uuid,
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        subject = ${input.subject ?? null},
        currency = ${input.currency},
        exchange_rate = ${input.exchange_rate ?? 1},
        subtotal = ${totals.subtotal},
        discount_total = ${totals.discount_total},
        tax_total = 0,
        adjustment = ${adjustment},
        total = ${totals.total},
        terms = ${input.terms ?? null},
        notes = ${input.notes ?? null},
        updated_at = now()
      WHERE id = ${quotationId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM quotation_lines WHERE quotation_id = ${quotationId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const number =
      input.quotation_number && input.quotation_number.length > 0
        ? input.quotation_number
        : await nextDocumentNumber(tx, orgId, "quotation", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO quotations (
        org_id, contact_id, quotation_number, status, issue_date, due_date, expiry_date, reference_number,
        salesperson, project_id, warehouse_id, subject, currency, exchange_rate, subtotal, discount_total, tax_total,
        adjustment, total, terms, notes, created_by
      ) VALUES (
        ${orgId}::uuid, ${input.contact_id}::uuid, ${number}, ${input.status}, ${input.issue_date}::date, ${dueDate}::date,
        ${expiry}::date, ${input.reference_number ?? null}, ${input.salesperson ?? null}, ${input.project_id ?? null}::uuid,
        ${input.warehouse_id ?? null}::uuid, ${input.subject ?? null}, ${input.currency}, ${input.exchange_rate ?? 1}, ${totals.subtotal}, ${totals.discount_total},
        0, ${adjustment}, ${totals.total}, ${input.terms ?? null}, ${input.notes ?? null}, ${userId ? userId : null}::uuid
      ) RETURNING id`;
    id = rows[0].id;
  }

  let order = 0;
  for (const line of totals.lines) {
    await tx.$executeRaw`
      INSERT INTO quotation_lines (org_id, quotation_id, item_id, account_id, description, quantity, rate, discount, tax_amount, line_total, display_order)
      VALUES (
        ${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid,
        ${line.description}, ${line.quantity}, ${line.rate}, ${line.discount}, 0, ${line.line_total}, ${order}
      )`;
    order += 1;
  }

  return { id };
}
