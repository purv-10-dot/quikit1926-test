import { z } from "zod";

export const createTimesheetSchema = z.object({
  issueId: z.string().min(1),
  entryDate: z.string().datetime(),
  hours: z.number().min(0.25).max(24),
  description: z.string().max(2000).optional(),
});

export const updateTimesheetSchema = createTimesheetSchema.partial();
