import { z } from "zod";
import { MAX_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";

const weekCount = z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER);

/**
 * POST /api/org/quarters — bulk-generate all 4 quarters for a fiscal year.
 * Takes the fiscal year number, an optional explicit start date, and (in
 * Custom Quarter Settings mode) an optional per-quarter week count list
 * [Q1, Q2, Q3, Q4] plus an informational weekly meeting day.
 */
export const generateQuartersSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2099),
  startDate: z.string().optional().nullable(),
  weekCounts: z.array(weekCount).length(4).optional(),
  weeklyMeetingDay: z.string().max(20).optional().nullable(),
});

/**
 * PUT /api/org/quarters/[id] — update an individual quarter. In Custom Quarter
 * Settings mode `weekCount` (and, for Q1, `startDate`) can be edited; the API
 * recomputes the contiguous chain for the FY.
 */
export const updateQuarterSchema = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  weekCount: weekCount.optional(),
});

export type GenerateQuartersInput = z.infer<typeof generateQuartersSchema>;
export type UpdateQuarterInput = z.infer<typeof updateQuarterSchema>;
