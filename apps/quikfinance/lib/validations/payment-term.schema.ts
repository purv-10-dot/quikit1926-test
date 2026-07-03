import { z } from "zod";

export const paymentTermSchema = z.object({
  name: z.string().trim().min(1).max(80),
  term_type: z.enum(["days", "receipt", "eom", "eonm"]).default("days"),
  days: z.coerce.number().int().min(0).max(365).default(0),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true)
});
