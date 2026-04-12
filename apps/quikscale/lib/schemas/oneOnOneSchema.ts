import { z } from "zod";

/**
 * 1:1 meetings — manager/report recurring syncs.
 *
 * Distinct from Meeting (which is the generic cadence model). A 1:1 is
 * specifically a 2-person sync between a manager and their direct report,
 * with talking points that carry forward from session to session.
 */

export const MOOD_VALUES = ["green", "yellow", "red"] as const;
export type OneOnOneMood = (typeof MOOD_VALUES)[number];

export const createOneOnOneSchema = z.object({
  managerId: z.string().cuid("managerId must be a cuid"),
  reportId: z.string().cuid("reportId must be a cuid"),
  scheduledAt: z.string().datetime("scheduledAt must be an ISO datetime"),
  duration: z.number().int().positive().default(30),
  talkingPoints: z.string().optional().nullable(),
});

export const updateOneOnOneSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().positive().optional(),
  talkingPoints: z.string().optional().nullable(),
  actionItems: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  mood: z.enum(MOOD_VALUES).optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

export const listOneOnOnesParamsSchema = z.object({
  managerId: z.string().cuid().optional(),
  reportId: z.string().cuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateOneOnOneInput = z.infer<typeof createOneOnOneSchema>;
export type UpdateOneOnOneInput = z.infer<typeof updateOneOnOneSchema>;
