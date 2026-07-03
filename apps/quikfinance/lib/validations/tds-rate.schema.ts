import { z } from "zod";

export const tdsRateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rate: z.coerce.number().min(0).max(100),
  tax_act: z.enum(["new_2025", "old_1961"]).default("new_2025"),
  section: z.string().trim().max(80).optional().nullable(),
  higher_rate: z.boolean().default(false),
  start_date: z.string().trim().max(10).optional().nullable(),
  end_date: z.string().trim().max(10).optional().nullable(),
  is_active: z.boolean().default(true)
});
