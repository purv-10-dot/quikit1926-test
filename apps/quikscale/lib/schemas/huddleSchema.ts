import { z } from "zod";

export const createHuddleSchema = z.object({
  meetingDate: z.string().min(1, "Meeting date is required"),
  callStatus: z.string().min(1, "Call status is required"),
  clientName: z.string().max(200).optional().nullable(),
  absentMembers: z.string().max(500).optional().nullable(),
  actualStartTime: z.string().max(20).optional().nullable(),
  actualEndTime: z.string().max(20).optional().nullable(),
  yesterdaysAchievements: z.boolean().optional(),
  stuckIssues: z.boolean().optional(),
  todaysPriority: z.boolean().optional(),
  notesKPDashboard: z.string().max(5000).optional().nullable(),
  otherNotes: z.string().max(5000).optional().nullable(),
});

export const updateHuddleSchema = createHuddleSchema.partial();

export type CreateHuddleInput = z.infer<typeof createHuddleSchema>;
export type UpdateHuddleInput = z.infer<typeof updateHuddleSchema>;
