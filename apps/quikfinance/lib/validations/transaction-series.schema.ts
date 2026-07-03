import { z } from "zod";
import { NUMBER_MODULE_KEYS } from "@/lib/accounting/numbering";

const moduleCfg = z.object({ prefix: z.string().trim().max(20).default(""), next_number: z.coerce.number().int().min(1).default(1) });

export const seriesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  is_default: z.boolean().default(false),
  config: z.record(z.enum(NUMBER_MODULE_KEYS as [string, ...string[]]), moduleCfg).default({})
});
