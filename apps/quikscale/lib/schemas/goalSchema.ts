import { z } from "zod";

/**
 * Goal — quarterly/annual objectives that live in the People section.
 *
 * Distinct from Priority (which is short-term execution). Goals capture
 * what a person or team is trying to achieve over a quarter or year, with
 * optional measurement + hierarchy (company → team → individual).
 */

export const GOAL_STATUSES = [
  "draft",
  "active",
  "on-track",
  "at-risk",
  "completed",
  "abandoned",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_CATEGORIES = ["business", "personal", "team", "other"] as const;

export const createGoalSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
  ownerId: z.string().cuid("ownerId must be a cuid"),
  parentGoalId: z.string().cuid().optional().nullable(),

  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),

  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional().nullable(),
  year: z.number().int().min(2000).max(2100),

  status: z.enum(GOAL_STATUSES).default("draft"),
});

export const updateGoalSchema = createGoalSchema.partial();

export const listGoalsParamsSchema = z.object({
  ownerId: z.string().cuid().optional(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  parentGoalId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
