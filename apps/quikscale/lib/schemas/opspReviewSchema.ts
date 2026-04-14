import { z } from "zod";

/**
 * OPSP Review validation schemas.
 *
 * Used by POST /api/opsp/review to validate review entry upserts.
 * Each entry represents one achieved value for a specific period
 * within a category row (e.g. Revenue → m1 achieved = 1.5).
 */

const horizonEnum = z.enum(["quarter", "yearly", "3to5year"]);

const periodEnum = z.enum([
  "m1", "m2", "m3",                    // quarter (actions)
  "q1", "q2", "q3", "q4",             // yearly (goals)
  "y1", "y2", "y3", "y4", "y5",       // 3-5 year (targets)
]);

const entrySchema = z.object({
  period: periodEnum,
  targetValue: z.number().nullable().optional(),
  achievedValue: z.number().nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
});

/**
 * POST /api/opsp/review — saves all period entries for one row at once.
 * This matches the modal UX: user fills Month 1/2/3 tabs, then clicks Save.
 */
export const opspReviewSaveSchema = z.object({
  year: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  horizon: horizonEnum,
  rowIndex: z.number().int().min(0).max(20),
  category: z.string().min(1).max(200),
  entries: z.array(entrySchema).min(1).max(5),
});

/**
 * POST /api/opsp/review/secondary — saves status + comment for a secondary row
 * (rocks / key initiatives / key thrusts).
 * Uses the same OPSPReviewEntry table with period="secondary".
 */
export const opspReviewSecondarySaveSchema = z.object({
  year: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  horizon: horizonEnum,
  rowIndex: z.number().int().min(0).max(50),
  category: z.string().min(1).max(500),
  status: z.string().max(50).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export type OpspReviewSaveInput = z.infer<typeof opspReviewSaveSchema>;
export type OpspReviewEntry = z.infer<typeof entrySchema>;
export type OpspReviewSecondarySaveInput = z.infer<typeof opspReviewSecondarySaveSchema>;
