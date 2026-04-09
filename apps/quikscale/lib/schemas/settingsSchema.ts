import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  country: z.string().max(5).optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
  bio: z.string().max(275).optional().nullable(),
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
