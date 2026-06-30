import { z } from "zod";
import { MAX_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";

/**
 * Request body for `POST /api/priority/duplicate-check`.
 *
 * Mirrors the subset of Priority fields that define a "same priority" for the
 * OPSP export flow: the name (matched semantically) plus the fields that must
 * match exactly for two priorities to be considered duplicates — owner,
 * quarter, year, and the start/end week window. Workflow state
 * (`overallStatus`) is intentionally NOT part of identity.
 */
export const priorityDuplicateCheckSchema = z.object({
  name: z.string().trim().min(1, "Priority name is required"),
  owner: z.string().min(1, "Owner is required"),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.number().int().min(2020).max(2099),
  startWeek: z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).nullable().optional(),
  endWeek: z.number().int().min(1).max(MAX_WEEKS_PER_QUARTER).nullable().optional(),
});

export type PriorityDuplicateCheckInput = z.infer<typeof priorityDuplicateCheckSchema>;
