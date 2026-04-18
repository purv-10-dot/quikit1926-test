import { z } from "zod";

/**
 * Continuous Feedback — lightweight peer/manager/upward feedback drops.
 *
 * The category distinguishes intent: kudos (positive recognition),
 * coaching (growth suggestion), concern (negative signal), general (neutral).
 *
 * Visibility:
 *   - "private"  → only fromUser and toUser can read
 *   - "shared"   → toUser's manager can also read (feeds into review aggregation)
 */

export const FEEDBACK_CATEGORIES = [
  "kudos",
  "coaching",
  "concern",
  "general",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_VISIBILITIES = ["private", "shared"] as const;
export type FeedbackVisibility = (typeof FEEDBACK_VISIBILITIES)[number];

export const RELATED_TYPES = ["priority", "meeting", "kpi"] as const;

export const createFeedbackSchema = z.object({
  toUserId: z.string().cuid("toUserId must be a cuid"),
  category: z.enum(FEEDBACK_CATEGORIES),
  visibility: z.enum(FEEDBACK_VISIBILITIES).default("private"),
  content: z.string().trim().min(1, "Feedback content is required").max(5000),
  relatedType: z.enum(RELATED_TYPES).optional().nullable(),
  relatedId: z.string().cuid().optional().nullable(),
});

export const listFeedbackParamsSchema = z.object({
  toUserId: z.string().cuid().optional(),
  fromUserId: z.string().cuid().optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  visibility: z.enum(FEEDBACK_VISIBILITIES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
