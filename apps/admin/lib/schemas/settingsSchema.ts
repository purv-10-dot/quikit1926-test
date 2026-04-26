import { z } from "zod";

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export const updateSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex")
    .optional(),
  billingEmail: z.string().email().optional().nullable(),
  fiscalYearStart: z.number().min(1).max(12).optional(),
  weekStartDay: z.number().min(0).max(6).optional(),
  allowedEmailDomains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(DOMAIN_RE, "Invalid domain (e.g. acme.com)")
    )
    .max(20)
    .optional(),
});
