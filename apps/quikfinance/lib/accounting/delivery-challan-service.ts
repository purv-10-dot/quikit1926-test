import { Prisma } from "@prisma/client";
import { z } from "zod";
import { round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import type { InvoiceInput } from "@/lib/validations/invoice.schema";

type Tx = Prisma.TransactionClient;

/**
 * A delivery challan records goods physically dispatched to a customer before
 * (or without) an invoice — job work, supply on approval, etc. Following Zoho
 * Books, the challan itself is a non-posting document: it does NOT touch the
 * general ledger or inventory. Stock issue, COGS, and the A/R entry are all
 * recognised when the challan is converted to an invoice (see
 * `convertChallanToInvoice`), which avoids double-counting stock.
 */

export const CHALLAN_TYPES = ["supply_on_approval", "job_work", "supply_of_liquid_gas", "lines_sales", "others"] as const;

export const deliveryChallanSchema = z.object({
  challan_number: z.string().trim().max(40).optional(),
  challan_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  contact_id: z.string().uuid(),
  sales_order_id: z.string().uuid().optional().nullable(),
  warehouse_id: z.string().uuid().optional().nullable(),
  challan_type: z.enum(CHALLAN_TYPES).default("supply_on_approval"),
  status: z.enum(["draft", "open", "delivered", "invoiced", "returned", "cancelled"]).default("draft"),
  reference: z.string().trim().max(120).optional().nullable(),
  place_of_supply: z.string().trim().max(2).optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        item_id: z.string().uuid().optional().nullable(),
        description: z.string().trim().min(1).max(500),
        quantity: z.coerce.number().positive(),
        rate: z.coerce.number().min(0).default(0),
        discount: z.coerce.number().min(0).default(0),
        tax_rate_id: z.string().uuid().optional().nullable()
      })
    )
    .min(1)
});

export type DeliveryChallanInput = z.infer<typeof deliveryChallanSchema>;

/** Create or update a delivery challan with its lines. Non-posting. */
export async function saveDeliveryChallan(
  tx: Tx,
  orgId: string,
  userId: string | null,
  input: DeliveryChallanInput,
  challanId?: string
): Promise<{ id: string }> {
  // Server-authoritative totals from the lines.
  const adjustment = round2(input.adjustment ?? 0);
  let subtotal = 0;
  let discountTotal = 0;
  const computed = input.lines.map((line) => {
    const gross = round2(line.quantity * line.rate);
    const discount = round2(line.discount ?? 0);
    subtotal = round2(subtotal + gross);
    discountTotal = round2(discountTotal + discount);
    return { ...line, discount, line_total: round2(gross - discount) };
  });
  const total = round2(subtotal - discountTotal + adjustment);

  let id = challanId ?? "";
  if (challanId) {
    await tx.$executeRaw`
      UPDATE delivery_challans SET
        contact_id = ${input.contact_id}::uuid,
        sales_order_id = ${input.sales_order_id ?? null}::uuid,
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        challan_date = ${input.challan_date}::date,
        challan_type = ${input.challan_type},
        status = ${input.status},
        reference = ${input.reference ?? null},
        place_of_supply = ${input.place_of_supply ?? null},
        subtotal = ${subtotal},
        discount_total = ${discountTotal},
        adjustment = ${adjustment},
        total = ${total},
        terms = ${input.terms ?? null},
        notes = ${input.notes ?? null},
        updated_at = now()
      WHERE id = ${challanId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM delivery_challan_lines WHERE challan_id = ${challanId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const number =
      input.challan_number && input.challan_number.length > 0
        ? input.challan_number
        : await nextDocumentNumber(tx, orgId, "delivery_challan", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO delivery_challans (
        org_id, challan_number, contact_id, sales_order_id, warehouse_id, challan_date, challan_type, status, reference, place_of_supply,
        subtotal, discount_total, adjustment, total, terms, notes, created_by
      ) VALUES (
        ${orgId}::uuid, ${number}, ${input.contact_id}::uuid, ${input.sales_order_id ?? null}::uuid, ${input.warehouse_id ?? null}::uuid,
        ${input.challan_date}::date, ${input.challan_type}, ${input.status}, ${input.reference ?? null}, ${input.place_of_supply ?? null},
        ${subtotal}, ${discountTotal}, ${adjustment}, ${total}, ${input.terms ?? null}, ${input.notes ?? null}, ${userId ? userId : null}::uuid
      ) RETURNING id`;
    id = rows[0].id;
  }

  let order = 0;
  for (const line of computed) {
    await tx.$executeRaw`
      INSERT INTO delivery_challan_lines (org_id, challan_id, item_id, description, quantity, rate, discount, line_total, tax_rate_id, display_order)
      VALUES (
        ${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.description},
        ${round2(line.quantity)}, ${round2(line.rate)}, ${line.discount}, ${line.line_total}, ${line.tax_rate_id ? line.tax_rate_id : null}::uuid, ${order}
      )`;
    order += 1;
  }

  return { id };
}

/**
 * Convert a delivery challan into a customer invoice. The invoice does the real
 * accounting (Dr A/R, Cr Revenue/Tax, plus FIFO stock issue + COGS for tracked
 * items) via `saveInvoice`. The challan is marked `invoiced` and linked.
 */
export async function convertChallanToInvoice(
  tx: Tx,
  orgId: string,
  userId: string | null,
  challanId: string,
  options: { issue_date?: string; due_date?: string } = {}
): Promise<{ invoiceId: string }> {
  const challanRows = await tx.$queryRaw<
    Array<{ contact_id: string; invoice_id: string | null; place_of_supply: string | null; challan_date: string }>
  >`
    SELECT contact_id, invoice_id, place_of_supply, to_char(challan_date,'YYYY-MM-DD') AS challan_date
    FROM delivery_challans WHERE id = ${challanId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  if (!challanRows.length) throw new Error("Delivery challan was not found.");
  if (challanRows[0].invoice_id) throw new Error("This delivery challan has already been invoiced.");

  const lines = await tx.$queryRaw<Array<{ item_id: string | null; description: string; quantity: string; rate: string; tax_rate_id: string | null }>>`
    SELECT item_id, description, quantity, rate, tax_rate_id FROM delivery_challan_lines
    WHERE challan_id = ${challanId}::uuid ORDER BY display_order ASC`;
  if (!lines.length) throw new Error("This delivery challan has no line items to invoice.");

  const issueDate = options.issue_date ?? challanRows[0].challan_date;
  const dueDate = options.due_date ?? issueDate;

  // Build the invoice input from the challan lines. saveInvoice recomputes
  // server-authoritative totals (incl. tax) from these lines.
  const invoiceInput = {
    contact_id: challanRows[0].contact_id,
    issue_date: issueDate,
    due_date: dueDate,
    status: "sent",
    currency: "INR",
    exchange_rate: 1,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    round_off: 0,
    tcs_amount: 0,
    total: 0,
    balance_due: 0,
    place_of_supply: challanRows[0].place_of_supply,
    template_type: "classic",
    line_items: lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      rate: Number(line.rate),
      discount: 0,
      tax_rate_id: line.tax_rate_id,
      account_id: null,
      item_id: line.item_id
    }))
  } as unknown as InvoiceInput;

  const { id: invoiceId } = await saveInvoice(tx, orgId, userId, invoiceInput);

  await tx.$executeRaw`
    UPDATE delivery_challans SET invoice_id = ${invoiceId}::uuid, status = 'invoiced', updated_at = now()
    WHERE id = ${challanId}::uuid AND org_id = ${orgId}::uuid`;

  return { invoiceId };
}
