import { z } from "zod";
import { currencyCodeSchema, idSchema, moneySchema } from "@/lib/validations/common.schema";

export const paymentSchema = z.object({
  contact_id: idSchema.optional().nullable(),
  payment_type: z.enum(["received", "made"]),
  payment_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  amount: moneySchema,
  currency: currencyCodeSchema.default("INR"),
  exchange_rate: z.coerce.number().positive().default(1),
  method: z.string().trim().min(2).max(80),
  reference: z.string().max(120).optional().nullable(),
  status: z.enum(["draft", "posted", "void"]).default("posted"),
  memo: z.string().max(1000).optional().nullable()
});

export const expenseSchema = z.object({
  expense_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  vendor_id: idSchema.optional().nullable(),
  customer_id: idSchema.optional().nullable(),
  account_id: idSchema,
  project_id: idSchema.optional().nullable(),
  warehouse_id: idSchema.optional().nullable(),
  amount: moneySchema,
  tax_amount: moneySchema.default(0),
  currency: currencyCodeSchema.default("INR"),
  reference: z.string().trim().max(120).optional().nullable(),
  receipt_url: z.string().url().optional().nullable(),
  is_billable: z.boolean().default(false),
  is_mileage: z.boolean().default(false),
  distance: z.coerce.number().min(0).optional().nullable(),
  mileage_rate: z.coerce.number().min(0).optional().nullable(),
  mileage_unit: z.string().trim().max(10).optional().nullable(),
  employee_name: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().min(2).max(500),
  status: z.enum(["draft", "posted", "void"]).default("posted"),
  attachments: z.array(z.object({
    id: idSchema.optional(),
    file_name: z.string().trim().min(1).max(255),
    content_type: z.string().max(200).optional().nullable(),
    size_bytes: z.coerce.number().int().min(0).default(0),
    data: z.string().max(20_000_000).optional().nullable()
  })).optional()
});

export const journalEntrySchema = z.object({
  entry_number: z.string().trim().min(2).max(40).optional(),
  entry_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  status: z.enum(["draft", "submitted", "approved", "posted", "void"]).default("draft"),
  memo: z.string().max(1000).optional().nullable(),
  source_type: z.string().max(80).optional().nullable(),
  source_id: idSchema.optional().nullable()
});

export const bankAccountSchema = z.object({
  account_id: idSchema.optional().nullable(),
  name: z.string().trim().min(2).max(160),
  institution_name: z.string().trim().max(160).optional().nullable(),
  account_number_last4: z.string().trim().max(4).optional().nullable(),
  currency: currencyCodeSchema.default("INR"),
  current_balance: moneySchema.default(0),
  is_active: z.boolean().default(true)
});

export const departmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional().nullable(),
  type: z.enum(["division", "department"]).default("department"),
  parent_id: idSchema.optional().nullable(),
  is_active: z.boolean().default(true)
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

/** A budgeted account with one amount per period slot (month 1..12 / quarter 1..4 / year 1). */
export const budgetLineSchema = z.object({
  account_id: idSchema,
  amounts: z.array(z.coerce.number().min(-9_999_999_999).max(9_999_999_999)).max(12).default([])
});

export const budgetSchema = z.object({
  name: z.string().trim().min(2).max(160),
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  period: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  location_id: idSchema.optional().nullable(),
  department_id: idSchema.optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  lines: z.array(budgetLineSchema).default([])
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const fixedAssetSchema = z.object({
  asset_number: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(160),
  purchase_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  purchase_cost: moneySchema,
  salvage_value: moneySchema.default(0),
  useful_life_months: z.coerce.number().int().positive().max(600),
  depreciation_method: z.enum(["straight_line", "declining_balance"]).default("straight_line"),
  accumulated_depreciation: moneySchema.default(0),
  status: z.enum(["active", "disposed", "retired"]).default("active")
});

// Treat empty strings from <select>/<input> as "not set" so optional uuid/text
// fields validate (and clear) cleanly rather than failing the uuid check.
const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), idSchema.optional().nullable());
const optionalText = z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable().optional());

// Tags arrive as a comma-separated string or an array; persist as a clean,
// comma-separated, de-duplicated string.
const tagsSchema = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  const parts = (Array.isArray(v) ? v : String(v).split(",")).map((t) => String(t).trim()).filter(Boolean);
  return parts.length ? Array.from(new Set(parts)).join(", ") : null;
}, z.string().max(500).nullable().optional());

export const inventoryItemSchema = z.object({
  // SKU / Item Code — optional in the UI; the API auto-generates one on create
  // when absent (see inventoryRouteConfig).
  sku: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(160),
  short_name: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable().optional()),
  item_type: z.enum(["inventory", "non_inventory", "service", "bundle"]).default("inventory"),
  unit: z.string().trim().min(1).max(20).optional(),
  brand: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  manufacturer: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  tags: tagsSchema,
  category_id: optionalId,
  subcategory_id: optionalId,
  barcode: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  image_url: z.preprocess((v) => (v === "" ? null : v), z.string().max(5_000_000).nullable().optional()),
  sales_price: moneySchema.default(0),
  purchase_price: moneySchema.default(0),
  description: optionalText,
  purchase_description: optionalText,
  income_account_id: optionalId,
  expense_account_id: optionalId,
  preferred_vendor_id: optionalId,
  quantity_on_hand: z.coerce.number().min(0).default(0),
  reorder_point: z.coerce.number().min(0).default(0),
  is_active: z.boolean().default(true)
});

export const projectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  customer_id: idSchema.optional().nullable(),
  status: z.enum(["planned", "active", "on_hold", "complete"]).default("active"),
  budget_amount: moneySchema.default(0),
  billing_method: z.enum(["fixed_fee", "time_and_materials", "non_billable"]).default("time_and_materials")
});

export const taxRateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  rate: z.coerce.number().min(0).max(100),
  tax_type: z.string().trim().min(2).max(80),
  is_compound: z.boolean().default(false),
  is_active: z.boolean().default(true)
});

export const currencySchema = z.object({
  code: currencyCodeSchema,
  name: z.string().trim().min(2).max(80),
  symbol: z.string().trim().min(1).max(8),
  decimal_places: z.coerce.number().int().min(0).max(4).default(2)
});
