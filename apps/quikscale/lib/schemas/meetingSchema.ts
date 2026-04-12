import { z } from "zod";

/**
 * Meeting Rhythm — Zod schemas for the generic Meeting model.
 *
 * Covers the Scaling Up cadences (daily / weekly / monthly / quarterly / annual)
 * with a single shared shape. The Daily Huddle keeps its own page + model
 * (`DailyHuddle`) for now — this schema is for the other 4 cadences via the
 * generic `Meeting` table.
 */

export const CADENCES = ["daily", "weekly", "monthly", "quarterly", "annual"] as const;
export type Cadence = (typeof CADENCES)[number];

export const createMeetingSchema = z.object({
  name: z.string().trim().min(1, "Meeting name is required").max(200),
  cadence: z.enum(CADENCES, { required_error: "Cadence is required" }),
  templateId: z.string().cuid().optional().nullable(),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO datetime" }),
  duration: z.number().int().positive("Duration must be positive (minutes)"),
  location: z.string().trim().max(200).optional().nullable(),
  meetingLink: z.string().trim().url().optional().nullable().or(z.literal("")),
  agenda: z.string().optional().nullable(),
  attendeeIds: z.array(z.string().cuid()).default([]),
});

export const updateMeetingSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().positive().optional(),
  location: z.string().trim().max(200).optional().nullable(),
  meetingLink: z.string().trim().url().optional().nullable().or(z.literal("")),
  agenda: z.string().optional().nullable(),
  decisions: z.string().optional().nullable(),
  blockers: z.string().optional().nullable(),
  highlights: z.string().optional().nullable(),
  startedOnTime: z.boolean().optional(),
  endedOnTime: z.boolean().optional(),
  formatFollowed: z.boolean().optional(),
  followUpRate: z.number().min(0).max(1).optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  attendeeIds: z.array(z.string().cuid()).optional(),
});

export const listMeetingsParamsSchema = z.object({
  cadence: z.enum(CADENCES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/* ── Templates ────────────────────────────────────────────────────────────── */

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  cadence: z.enum(CADENCES),
  description: z.string().optional().nullable(),
  sections: z.array(z.string().trim().min(1)).min(1, "At least one section required"),
  defaultAttendees: z.array(z.string().cuid()).default([]),
  duration: z.number().int().positive().default(60),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
