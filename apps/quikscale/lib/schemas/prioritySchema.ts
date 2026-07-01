import { z } from "zod";
import { MAX_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";

// String length caps on user-content fields (name/description/notes) lifted —
// Prisma columns are `text` (no DB limit). `.min(1)` stays on required fields.
export const createPrioritySchema = z.object({
  name:          z.string().min(1, "Priority name is required"),
  description:   z.string().optional().nullable(),
  owner:         z.string().min(1, "Owner is required"),
  teamId:        z.string().optional().nullable(),
  quarter:       z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year:          z.number().int().min(2020).max(2099),
  startWeek:     z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).optional().nullable(),
  endWeek:       z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).optional().nullable(),
  overallStatus: z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","not-started"]).default("not-yet-started"),
  notes:         z.string().optional().nullable(),
  // Set true only by the OPSP "Export → Create Priorities" flow. Display-only;
  // the Add/Edit Priority form never sends it (defaults false).
  importedFromOpsp: z.boolean().optional(),
});

// Update — fully partial so PATCH-style updates work.
export const updatePrioritySchema = z.object({
  name:          z.string().min(1).optional(),
  description:   z.string().optional().nullable(),
  owner:         z.string().min(1).optional(),
  teamId:        z.string().optional().nullable(),
  quarter:       z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year:          z.number().int().min(2020).max(2099).optional(),
  startWeek:     z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).optional().nullable(),
  endWeek:       z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).optional().nullable(),
  overallStatus: z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","not-started"]).optional(),
  notes:         z.string().optional().nullable(),
  // OPSP "Export → Replace Priority" flow only. When true, wipe the existing
  // priority's weekly statuses + notes and reset its overall status so the
  // replaced priority starts fresh ("Reset"); when false/absent the previous
  // weekly data is carried forward.
  resetWeeklyData:  z.boolean().optional(),
  // When true, email the owner that their priority was replaced (set by the
  // OPSP export replace flow; the normal Edit form never sends it).
  notifyReplacement: z.boolean().optional(),
});

export const weeklyStatusSchema = z.object({
  weekNumber: z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER),
  status:     z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed",""]),
  notes:      z.string().optional().nullable(),
});

// Batch weekly-status save — multiple weeks in one request. Drives the
// "Bulk weekly update" change-history card when ≥3 distinct weeks change in a
// single save (e.g. the Completed cascade). Up to a full custom quarter.
export const weeklyStatusBatchSchema = z.object({
  inputs: z.array(weeklyStatusSchema).min(1).max(MAX_WEEKS_PER_QUARTER),
});

export type CreatePriorityInput     = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityInput     = z.infer<typeof updatePrioritySchema>;
export type WeeklyStatusInput        = z.infer<typeof weeklyStatusSchema>;
export type WeeklyStatusBatchInput   = z.infer<typeof weeklyStatusBatchSchema>;
