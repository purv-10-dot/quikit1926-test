import { z } from "zod";
import { inferStateCodeFromGstin } from "@/lib/india";
import { contactBaseSchema, contactPersonSchema, bankAccountSchema, contactDocumentSchema, customFieldSchema } from "@/lib/validations/customer.schema";

/** Vendors share the contact shape with customers (nested children + custom fields). */
export const vendorSchema = contactBaseSchema
  .extend({
    type: z.literal("vendor").default("vendor"),
    contacts_people: z.array(contactPersonSchema).max(50).optional(),
    bank_accounts: z.array(bankAccountSchema).max(20).optional(),
    documents: z.array(contactDocumentSchema).max(20).optional(),
    custom_fields: z.array(customFieldSchema).max(50).optional()
  })
  .superRefine((value, ctx) => {
    if (value.contact_kind === "business" && !value.company_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["company_name"], message: "Company name is required for a business." });
    }
    if (value.contact_kind === "individual" && !value.first_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["first_name"], message: "First name is required for an individual." });
    }
  })
  .transform((value) => ({
    ...value,
    state_code: value.state_code ?? inferStateCodeFromGstin(value.tax_id),
    is_active: value.status === "active"
  }));

export type VendorInput = z.infer<typeof vendorSchema>;
