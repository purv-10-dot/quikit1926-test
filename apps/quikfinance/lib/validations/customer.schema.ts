import { z } from "zod";
import { optionalGstinSchema, optionalPanSchema, optionalStateCodeSchema, inferStateCodeFromGstin } from "@/lib/india";
import { currencyCodeSchema, moneySchema } from "@/lib/validations/common.schema";

// ---- Indian compliance formats (optional; validated only when provided) ----
const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const MSME_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
const CIN_PATTERN = /^[LUu][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).nullable();

const tanSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === "" || TAN_PATTERN.test(v), "Enter a valid 10-character TAN (e.g. ABCD12345E).")
  .optional()
  .or(z.literal(""))
  .nullable();

const msmeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === "" || MSME_PATTERN.test(v), "Enter a valid Udyam/MSME number (e.g. UDYAM-MH-01-1234567).")
  .optional()
  .or(z.literal(""))
  .nullable();

const cinSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === "" || CIN_PATTERN.test(v), "Enter a valid 21-character CIN.")
  .optional()
  .or(z.literal(""))
  .nullable();

// ---- Tab 2: addresses (stored in billing_address / shipping_address JSON) ----
export const customerAddressSchema = z
  .object({
    line1: optional(160),
    line2: optional(160),
    city: optional(80),
    state: optional(80),
    state_code: optionalStateCodeSchema,
    country: optional(80),
    postal_code: optional(24),
    landmark: optional(160),
    phone: optional(40)
  })
  .partial()
  .default({});

// Custom fields: free-form label/value pairs.
export const customFieldSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().max(500).optional().nullable()
});

// ---- Tab 5: contact persons ----
export const contactPersonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  designation: optional(80),
  department: optional(80),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  mobile: optional(40),
  whatsapp: optional(40),
  is_primary: z.boolean().default(false),
  is_decision_maker: z.boolean().default(false)
});

// ---- Tab 7: banking ----
export const bankAccountSchema = z.object({
  id: z.string().uuid().optional(),
  account_holder_name: optional(160),
  bank_name: optional(160),
  account_number: optional(40),
  ifsc: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "Enter a valid IFSC code.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  branch: optional(120),
  swift_code: optional(20),
  upi_id: optional(80)
});

// ---- Tab 8: documents (metadata; file upload handled separately) ----
export const contactDocumentSchema = z.object({
  id: z.string().uuid().optional(),
  doc_type: z.enum(["pan", "gst_certificate", "company_registration", "agreement", "purchase_order", "other"]).default("other"),
  file_name: z.string().trim().min(1).max(255),
  storage_url: z.string().trim().max(1000).optional().nullable(),
  mime_type: optional(120),
  size_bytes: z.coerce.number().int().min(0).max(26_214_400).default(0) // 25 MB cap
});

// ---- Base contact fields (shared with vendor flows) ----
const contactBaseShape = {
  // Tab 1: basic.
  contact_kind: z.enum(["business", "individual"]).default("business"),
  customer_category: z.enum(["customer", "vendor", "customer_vendor"]).default("customer"),
  customer_code: z.string().trim().max(40).optional().nullable(),
  display_name: z.string().trim().min(2).max(160),
  company_name: optional(160),
  first_name: optional(80),
  last_name: optional(80),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: optional(40),
  mobile: optional(40),
  website: z.string().trim().url().optional().or(z.literal("")).nullable(),
  customer_language: z.string().trim().max(10).default("en"),
  // Preferred date format on printed documents; null/empty inherits the org's.
  date_format: z.string().trim().max(20).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  // Tax & compliance.
  tax_id: optionalGstinSchema,
  pan: optionalPanSchema,
  tan: tanSchema,
  msme_number: msmeSchema,
  cin_number: cinSchema,
  tax_category: optional(80),
  tax_exempt: z.boolean().default(false),
  gst_treatment: z.enum(["registered", "consumer", "sez", "overseas", "unregistered"]).default("registered"),
  state_code: optionalStateCodeSchema,
  // Financials.
  currency: currencyCodeSchema.default("INR"),
  ar_account_id: z.string().uuid().optional().nullable(),
  payment_terms: z.coerce.number().int().min(0).max(365).default(30),
  credit_limit: moneySchema.optional().nullable(),
  credit_days: z.coerce.number().int().min(0).max(365).optional().nullable(),
  opening_balance: moneySchema.default(0),
  price_list: optional(80),
  tds_applicable: z.boolean().default(false),
  // Addresses.
  billing_address: customerAddressSchema,
  shipping_address: customerAddressSchema,
  // Sales information.
  account_owner: optional(120),
  salesperson: optional(120),
  lead_source: optional(80),
  customer_segment: optional(80),
  territory: optional(80),
  region: optional(80),
  referral_partner: optional(120),
  // Portal access.
  portal_enabled: z.boolean().default(false),
  portal_username: optional(120),
  mfa_enabled: z.boolean().default(false),
  // Projects (feature-flagged).
  project_name: optional(160),
  site_name: optional(160),
  project_manager: optional(120),
  contract_value: moneySchema.optional().nullable(),
  customer_since: z.coerce.date().transform((v) => v.toISOString().slice(0, 10)).optional().nullable(),
  // Misc.
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true)
};

export const contactBaseSchema = z.object(contactBaseShape);

/** Apply India-specific defaults (state code from GSTIN) + keep is_active in sync with status. */
export function withIndiaDefaults<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.transform((value) => ({
    ...value,
    state_code: (value as { state_code?: string | null }).state_code ?? inferStateCodeFromGstin((value as { tax_id?: string | null }).tax_id),
    is_active: (value as { status?: string }).status ? (value as { status?: string }).status === "active" : (value as { is_active?: boolean }).is_active
  }));
}

export const customerSchema = contactBaseSchema
  .extend({
    type: z.literal("customer").default("customer"),
    // Nested collections (customers only; vendors use the generic CRUD).
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
    // Keep is_active in sync with the status field.
    is_active: value.status === "active"
  }));

export type CustomerInput = z.infer<typeof customerSchema>;
export type ContactPersonInput = z.infer<typeof contactPersonSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type ContactDocumentInput = z.infer<typeof contactDocumentSchema>;
