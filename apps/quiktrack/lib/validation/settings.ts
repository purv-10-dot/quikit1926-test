import { z } from "zod";

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const updateGeneralSettingsSchema = z
  .object({
    themeMode: z.enum(THEME_MODES).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color")
      .optional(),
  })
  .refine((d) => d.themeMode !== undefined || d.accentColor !== undefined, {
    message: "At least one of themeMode or accentColor must be provided",
  });

export type UpdateGeneralSettingsInput = z.infer<typeof updateGeneralSettingsSchema>;
