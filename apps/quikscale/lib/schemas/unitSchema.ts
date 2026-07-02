import { z } from "zod";

/**
 * Unit Master (Org Setup) — measurement-unit labels (e.g. "Leads", "Calls",
 * "kg") chosen on a Number KPI's Target Value. Mirrors categorySchema; name +
 * optional description only (no dataType/currency — units are plain labels).
 */
export const createUnitSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  description: z.string().optional().nullable(),
});

export const updateUnitSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
