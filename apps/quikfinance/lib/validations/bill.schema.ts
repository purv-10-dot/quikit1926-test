import { z } from "zod";
import { idSchema } from "@/lib/validations/common.schema";
import { invoiceSchema } from "@/lib/validations/invoice.schema";

export const billAttachmentSchema = z.object({
  id: idSchema.optional(),
  file_name: z.string().trim().min(1).max(255),
  content_type: z.string().max(200).optional().nullable(),
  size_bytes: z.coerce.number().int().min(0).default(0),
  // base64 data URL — present only for newly added files (existing ones carry an id).
  data: z.string().max(20_000_000).optional().nullable()
});

export const billSchema = invoiceSchema
  .omit({ invoice_number: true, status: true, template_type: true, terms: true, round_off: true })
  .extend({
    bill_number: z.string().trim().min(2).max(40).optional(),
    vendor_reference: z.string().trim().max(80).optional().nullable(),
    payment_terms: z.string().trim().max(80).optional().nullable(),
    ap_account_id: idSchema.optional().nullable(),
    tds_amount: z.coerce.number().min(0).default(0),
    status: z.enum(["draft", "open", "submitted", "approved", "partial", "paid", "void"]).default("draft"),
    attachments: z.array(billAttachmentSchema).optional()
  });

export type BillInput = z.infer<typeof billSchema>;
