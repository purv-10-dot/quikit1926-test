import { z } from "zod";
import { currencyCodeSchema, idSchema, moneySchema } from "@/lib/validations/common.schema";

export const importJobSchema = z.object({
  source_type: z.enum(["csv", "tally", "zoho_books", "bank_statement"]),
  entity_type: z.enum(["customers", "vendors", "invoices", "bills", "payments", "bank_transactions"]),
  file_name: z.string().trim().max(200).optional().nullable(),
  bank_account_id: idSchema.optional().nullable(),
  payload_text: z.string().trim().min(10, "Paste a CSV or JSON payload to continue."),
  notes: z.string().trim().max(1000).optional().nullable()
});

export const periodLockSchema = z.object({
  start_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  end_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  lock_scope: z.enum(["all", "sales", "purchases", "banking", "journals"]).default("all"),
  reason: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().default(true)
});

export const ocrDocumentSchema = z.object({
  document_type: z.enum(["bill", "invoice"]).default("bill"),
  source_name: z.string().trim().min(2).max(160),
  source_text: z.string().trim().min(20, "Paste OCR text to continue."),
  notes: z.string().trim().max(1000).optional().nullable()
});

export const paymentLinkCreateSchema = z.object({
  allow_partial: z.boolean().default(false),
  first_min_partial_amount: moneySchema.optional(),
  expires_in_days: z.coerce.number().int().min(1).max(180).default(14),
  callback_url: z.string().url().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  description: z.string().trim().max(500).optional().nullable()
});
