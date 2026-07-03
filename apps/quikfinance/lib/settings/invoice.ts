import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const invoiceSettingsSchema = z.object({
  // When true, a blank Invoice# is auto-generated on create; when false the user must enter one.
  auto_generate_number: z.boolean().default(true),
  prefix: z.string().trim().min(1).max(20).default("INV"),
  // The series starts at (at least) this number.
  next_number: z.coerce.number().int().min(1).default(1)
});

export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;
export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = invoiceSettingsSchema.parse({});

type PrismaLike = Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

/** Load (and default-fill) the org's invoice numbering settings. */
export async function loadInvoiceSettings(prisma: PrismaLike, orgId: string): Promise<InvoiceSettings> {
  const rows = (await prisma.$queryRaw`SELECT invoice_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ invoice_settings: unknown }>;
  const stored = (rows[0]?.invoice_settings ?? {}) as Record<string, unknown>;
  const parsed = invoiceSettingsSchema.safeParse({ ...DEFAULT_INVOICE_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_INVOICE_SETTINGS;
}
