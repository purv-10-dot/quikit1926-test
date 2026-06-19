import { z } from "zod";

/**
 * POST /api/org/quarters — bulk-generate all 4 quarters for a fiscal year.
 * Takes just the fiscal year number plus an optional explicit start date.
 */
export const generateQuartersSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2099),
  startDate: z.string().optional().nullable(),
});

/**
 * PUT /api/org/quarters/[id] — update the date range of an individual quarter.
 */
export const updateQuarterSchema = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

export type GenerateQuartersInput = z.infer<typeof generateQuartersSchema>;
export type UpdateQuarterInput = z.infer<typeof updateQuarterSchema>;
