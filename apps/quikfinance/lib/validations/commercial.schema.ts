import { z } from "zod";
import { currencyCodeSchema, idSchema, moneySchema } from "@/lib/validations/common.schema";

const statusLabelSchema = z.string().trim().min(2).max(80);

const baseCommercialSchema = z.object({
  contact_id: idSchema,
  issue_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  due_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional(),
  subtotal: moneySchema,
  tax_total: moneySchema.default(0),
  total: moneySchema,
  currency: currencyCodeSchema.default("INR"),
  notes: z.string().max(3000).optional().nullable()
});

/** A single line on a quote (mirrors invoice line items). */
export const quotationLineSchema = z.object({
  item_id: idSchema.optional().nullable(),
  account_id: idSchema.optional().nullable(),
  description: z.string().trim().min(1).max(2000),
  quantity: z.coerce.number().min(0).default(1),
  rate: moneySchema.default(0),
  discount: moneySchema.default(0)
});

export const quotationSchema = baseCommercialSchema.extend({
  quotation_number: z.string().trim().min(2).max(40).optional(),
  exchange_rate: z.coerce.number().positive().default(1),
  status: statusLabelSchema.default("draft"),
  reference_number: z.string().trim().max(80).optional().nullable(),
  expiry_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional().nullable(),
  salesperson: z.string().trim().max(120).optional().nullable(),
  project_id: idSchema.optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  subject: z.string().trim().max(500).optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  line_items: z.array(quotationLineSchema).optional()
});

export type QuotationInput = z.infer<typeof quotationSchema>;

export const salesOrderSchema = baseCommercialSchema.extend({
  sales_order_number: z.string().trim().min(2).max(40).optional(),
  status: statusLabelSchema.default("draft"),
  reference_number: z.string().trim().max(80).optional().nullable(),
  expected_shipment_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional().nullable(),
  payment_terms: z.string().trim().max(80).optional().nullable(),
  delivery_method: z.string().trim().max(120).optional().nullable(),
  salesperson: z.string().trim().max(120).optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  line_items: z.array(quotationLineSchema).optional()
});

export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

export const purchaseOrderSchema = baseCommercialSchema.extend({
  purchase_order_number: z.string().trim().min(2).max(40).optional(),
  status: statusLabelSchema.default("draft"),
  reference_number: z.string().trim().max(80).optional().nullable(),
  expected_delivery_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional().nullable(),
  payment_terms: z.string().trim().max(80).optional().nullable(),
  delivery_method: z.string().trim().max(120).optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  line_items: z.array(quotationLineSchema).optional()
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const creditNoteSchema = baseCommercialSchema.extend({
  invoice_id: idSchema.optional().nullable(),
  credit_note_number: z.string().trim().min(2).max(40).optional(),
  status: statusLabelSchema.default("draft"),
  reference_number: z.string().trim().max(80).optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  ar_account_id: idSchema.optional().nullable(),
  salesperson: z.string().trim().max(120).optional().nullable(),
  subject: z.string().trim().max(500).optional().nullable(),
  place_of_supply: z.string().trim().max(2).optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  line_items: z.array(quotationLineSchema.extend({ tax_rate_id: idSchema.optional().nullable() })).optional()
});

export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

export const vendorCreditSchema = baseCommercialSchema.extend({
  bill_id: idSchema.optional().nullable(),
  vendor_credit_number: z.string().trim().min(2).max(40).optional(),
  status: statusLabelSchema.default("draft"),
  reference_number: z.string().trim().max(80).optional().nullable(),
  order_number: z.string().trim().max(80).optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  ap_account_id: idSchema.optional().nullable(),
  subject: z.string().trim().max(500).optional().nullable(),
  place_of_supply: z.string().trim().max(2).optional().nullable(),
  adjustment: z.coerce.number().default(0),
  terms: z.string().max(3000).optional().nullable(),
  line_items: z.array(quotationLineSchema.extend({ tax_rate_id: idSchema.optional().nullable() })).optional()
});

export type VendorCreditInput = z.infer<typeof vendorCreditSchema>;

export const timeEntrySchema = z.object({
  project_id: idSchema,
  work_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  hours: z.coerce.number().positive().max(24),
  description: z.string().trim().min(2).max(1000),
  is_billable: z.boolean().default(true),
  is_billed: z.boolean().default(false),
  rate: moneySchema.default(0)
});
