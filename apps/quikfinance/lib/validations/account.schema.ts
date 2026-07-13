import { z } from "zod";
import { currencyCodeSchema, idSchema, moneySchema } from "@/lib/validations/common.schema";

export const accountSchema = z.object({
  category_id: idSchema.optional().nullable(),
  parent_id: idSchema.optional().nullable(),
  // Zoho lets the account code be blank; empty strings normalise to null.
  code: z.string().trim().max(20).optional().nullable().transform((v) => (v && v.length > 0 ? v : null)),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(500).optional().nullable(),
  account_type: z.enum([
    "cash",
    "bank",
    "accounts_receivable",
    "other_current_asset",
    "fixed_asset",
    "other_asset",
    "accounts_payable",
    "other_current_liability",
    "long_term_liability",
    "equity",
    "retained_earnings",
    "revenue",
    "cost_of_goods_sold",
    "expense",
    "other_income",
    "other_expense"
  ]),
  currency: currencyCodeSchema.default("INR"),
  is_active: z.boolean().default(true),
  is_system: z.boolean().default(false),
  show_on_dashboard: z.boolean().default(false),
  balance: moneySchema.default(0)
});

export type AccountInput = z.infer<typeof accountSchema>;
