import { z } from "zod";

// String length caps on user-content fields (name/description/notes) lifted —
// Prisma columns are `text` (no DB limit). `.min(1)` stays on required fields.
export const createPrioritySchema = z.object({
  name:          z.string().min(1, "Priority name is required"),
  description:   z.string().optional().nullable(),
  owner:         z.string().min(1, "Owner is required"),
  teamId:        z.string().optional().nullable(),
  quarter:       z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year:          z.number().int().min(2020).max(2099),
  startWeek:     z.number().int().min(1).max(13).optional().nullable(),
  endWeek:       z.number().int().min(1).max(13).optional().nullable(),
  overallStatus: z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","not-started"]).default("not-yet-started"),
  notes:         z.string().optional().nullable(),
});

// Update — fully partial so PATCH-style updates work.
export const updatePrioritySchema = z.object({
  name:          z.string().min(1).optional(),
  description:   z.string().optional().nullable(),
  owner:         z.string().min(1).optional(),
  teamId:        z.string().optional().nullable(),
  quarter:       z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year:          z.number().int().min(2020).max(2099).optional(),
  startWeek:     z.number().int().min(1).max(13).optional().nullable(),
  endWeek:       z.number().int().min(1).max(13).optional().nullable(),
  overallStatus: z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","not-started"]).optional(),
  notes:         z.string().optional().nullable(),
});

export const weeklyStatusSchema = z.object({
  weekNumber: z.number().int().min(1).max(13),
  status:     z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed",""]),
  notes:      z.string().optional().nullable(),
});

// Batch weekly-status save — multiple weeks in one request. Drives the
// "Bulk weekly update" change-history card when ≥3 distinct weeks change in a
// single save (e.g. the Completed cascade). 1–13 weeks (the fiscal quarter).
export const weeklyStatusBatchSchema = z.object({
  inputs: z.array(weeklyStatusSchema).min(1).max(13),
});

export type CreatePriorityInput     = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityInput     = z.infer<typeof updatePrioritySchema>;
export type WeeklyStatusInput        = z.infer<typeof weeklyStatusSchema>;
export type WeeklyStatusBatchInput   = z.infer<typeof weeklyStatusBatchSchema>;
