import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const quoteSettingsSchema = z.object({
  // Allow editing a quote after it has been accepted.
  allow_editing_accepted: z.boolean().default(false),
  // Let customers accept/decline via public link / WhatsApp (portal feature).
  allow_customer_accept: z.boolean().default(false),
  // What to do when a quote is accepted: nothing, draft invoice, or invoice + email.
  auto_convert: z.enum(["none", "draft_invoice", "invoice_email"]).default("none"),
  // Allow creating progress invoices from a quote.
  allow_progress_invoice: z.boolean().default(false),
  // Hide zero-value line items in the quote PDF / portal (unless the total is zero).
  hide_zero_value_lines: z.boolean().default(false),
  // Fields to retain when converting a quote to a sales order or invoice.
  retain_customer_notes: z.boolean().default(true),
  retain_terms: z.boolean().default(true),
  retain_address: z.boolean().default(true),
  // Default Terms & Conditions prefilled on new quotes.
  default_terms: z.string().max(4000).default("")
});

export type QuoteSettings = z.infer<typeof quoteSettingsSchema>;

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = quoteSettingsSchema.parse({});

type PrismaLike = Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

/** Load (and default-fill) the org's quote preferences. */
export async function loadQuoteSettings(prisma: PrismaLike, orgId: string): Promise<QuoteSettings> {
  const rows = (await prisma.$queryRaw`SELECT quote_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ quote_settings: unknown }>;
  const stored = (rows[0]?.quote_settings ?? {}) as Record<string, unknown>;
  const parsed = quoteSettingsSchema.safeParse({ ...DEFAULT_QUOTE_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_QUOTE_SETTINGS;
}
