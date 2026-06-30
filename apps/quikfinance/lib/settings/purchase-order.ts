import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const purchaseOrderSettingsSchema = z.object({
  // When true, a blank PO# is auto-generated on create; when false the user must enter one.
  auto_generate_number: z.boolean().default(true),
  prefix: z.string().trim().min(1).max(20).default("PO"),
  // The series starts at (at least) this number.
  next_number: z.coerce.number().int().min(1).default(1)
});

export type PurchaseOrderSettings = z.infer<typeof purchaseOrderSettingsSchema>;
export const DEFAULT_PURCHASE_ORDER_SETTINGS: PurchaseOrderSettings = purchaseOrderSettingsSchema.parse({});

type PrismaLike = Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

/** Load (and default-fill) the org's purchase-order numbering settings. */
export async function loadPurchaseOrderSettings(prisma: PrismaLike, orgId: string): Promise<PurchaseOrderSettings> {
  const rows = (await prisma.$queryRaw`SELECT purchase_order_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ purchase_order_settings: unknown }>;
  const stored = (rows[0]?.purchase_order_settings ?? {}) as Record<string, unknown>;
  const parsed = purchaseOrderSettingsSchema.safeParse({ ...DEFAULT_PURCHASE_ORDER_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_PURCHASE_ORDER_SETTINGS;
}
