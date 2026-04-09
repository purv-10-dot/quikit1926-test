import { z } from "zod";

// Create/Update KPI Schema
export const createKPISchema = z.object({
  name: z.string().min(1, "KPI name is required").max(200),
  description: z.string().max(1000).optional().nullable(),
  owner: z.string().cuid("Invalid owner ID"),
  teamId: z.string().cuid("Invalid team ID").optional().nullable(),
  parentKPIId: z.string().cuid("Invalid parent KPI ID").optional().nullable(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.number().int().min(2020).max(2099),
  measurementUnit: z.enum(["Number", "Percentage", "Currency", "Ratio"]),
  target: z.number().positive().optional().nullable(),
  quarterlyGoal: z.number().positive().optional().nullable(),
  qtdGoal: z.number().positive().optional().nullable(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  divisionType: z.enum(["Cumulative", "Standalone"]).default("Cumulative"),
  weeklyTargets: z.record(z.string(), z.number()).optional().nullable(),
  currency: z.string().optional().nullable(),
  targetScale: z.string().optional().nullable(),
});

export const updateKPISchema = createKPISchema.partial().required({ name: true });

// Weekly Value Schema
export const weeklyValueSchema = z.object({
  weekNumber: z.number().int().min(1).max(13),
  value: z.number().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

// KPI Note Schema
export const kpiNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

// List Query Params
export const kpiListParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(1000).default(20),
  status: z.enum(["active", "paused", "completed"]).optional(),
  owner: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year: z.number().int().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["name", "createdAt", "progressPercent", "healthStatus"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateKPIInput = z.infer<typeof createKPISchema>;
export type UpdateKPIInput = z.infer<typeof updateKPISchema>;
export type WeeklyValueInput = z.infer<typeof weeklyValueSchema>;
export type KPINoteInput = z.infer<typeof kpiNoteSchema>;
export type KPIListParams = z.infer<typeof kpiListParamsSchema>;
