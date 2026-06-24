import { z } from "zod";

/**
 * Request body for `POST /api/kpi/duplicate-check`.
 *
 * Mirrors the subset of KPI fields that define a "same KPI" for the OPSP
 * export flow: the name (matched semantically) plus the fields that must match
 * exactly for two KPIs to be considered duplicates — owner, quarter, year,
 * frequency, measurement unit, target value, division type, and colour coding.
 */
export const duplicateCheckSchema = z.object({
  name: z.string().trim().min(1, "KPI name is required"),
  owner: z.string().min(1, "Owner is required"),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.number().int().min(2020).max(2099),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  measurementUnit: z.enum(["Number", "Percentage", "Currency", "Ratio"]),
  target: z.number().nullable().optional(),
  divisionType: z.enum(["Cumulative", "Standalone"]),
  reverseColor: z.boolean().optional(),
});

export type DuplicateCheckInput = z.infer<typeof duplicateCheckSchema>;
