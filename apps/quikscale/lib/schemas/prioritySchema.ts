import { z } from "zod";

export const createPrioritySchema = z.object({
  name:          z.string().min(1, "Priority name is required").max(300),
  description:   z.string().max(2000).optional().nullable(),
  owner:         z.string().min(1, "Owner is required"),
  teamId:        z.string().optional().nullable(),
  quarter:       z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year:          z.number().int().min(2020).max(2099),
  startWeek:     z.number().int().min(1).max(13).optional().nullable(),
  endWeek:       z.number().int().min(1).max(13).optional().nullable(),
  overallStatus: z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","not-started"]).default("not-yet-started"),
  notes:         z.string().max(5000).optional().nullable(),
});

export const updatePrioritySchema = createPrioritySchema.partial().required({ name: true });

export const weeklyStatusSchema = z.object({
  weekNumber: z.number().int().min(1).max(13),
  status:     z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed",""]),
  notes:      z.string().max(1000).optional().nullable(),
});

export type CreatePriorityInput = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
export type WeeklyStatusInput   = z.infer<typeof weeklyStatusSchema>;
