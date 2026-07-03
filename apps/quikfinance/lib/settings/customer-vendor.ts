import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const DEFAULT_BILLING_FORMAT = `\${CONTACT.CONTACT_DISPLAYNAME}
\${CONTACT.CONTACT_ADDRESS}
\${CONTACT.CONTACT_CITY}
\${CONTACT.CONTACT_CODE} \${CONTACT.CONTACT_STATE}
\${CONTACT.CONTACT_COUNTRY}`;

export const DEFAULT_SHIPPING_FORMAT = `\${CONTACT.CONTACT_ADDRESS}
\${CONTACT.CONTACT_CITY}
\${CONTACT.CONTACT_CODE} \${CONTACT.CONTACT_STATE}
\${CONTACT.CONTACT_COUNTRY}`;

export const customerVendorSettingsSchema = z.object({
  allow_duplicate_names: z.boolean().default(false),
  enable_customer_numbers: z.boolean().default(false),
  enable_vendor_numbers: z.boolean().default(false),
  default_customer_type: z.enum(["business", "individual"]).default("business"),
  credit_limit_enabled: z.boolean().default(false),
  credit_limit_action: z.enum(["restrict", "warn"]).default("warn"),
  credit_limit_include_so: z.boolean().default(false),
  multi_currency_enabled: z.boolean().default(true),
  billing_address_format: z.string().max(4000).default(DEFAULT_BILLING_FORMAT),
  shipping_address_format: z.string().max(4000).default(DEFAULT_SHIPPING_FORMAT)
});

export type CustomerVendorSettings = z.infer<typeof customerVendorSettingsSchema>;

export const DEFAULT_SETTINGS: CustomerVendorSettings = customerVendorSettingsSchema.parse({});

/** Load (and default-fill) the org's customer/vendor settings. */
export async function loadCustomerVendorSettings(prisma: Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] }, orgId: string): Promise<CustomerVendorSettings> {
  const rows = (await prisma.$queryRaw`SELECT customer_vendor_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ customer_vendor_settings: unknown }>;
  const stored = (rows[0]?.customer_vendor_settings ?? {}) as Record<string, unknown>;
  const parsed = customerVendorSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
