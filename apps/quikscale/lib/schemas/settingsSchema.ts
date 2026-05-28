import { z } from "zod";

// Caps kept on structural identifiers (country = ISO 3166 2-letter code,
// timezone = IANA name) and on identifier-like fields (firstName/lastName).
// Bio is user-content and now uncapped.
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  country: z.string().max(5).optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
  bio: z.string().optional().nullable(),
});

export const updateCompanySchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").optional(),
  themeMode: z.enum(["light", "dark", "system"]).optional(),
});

export const updateConfigurationsSchema = z.object({
  flags: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean().optional(),
      value: z.string().optional().nullable(),
    })
  ),
});
