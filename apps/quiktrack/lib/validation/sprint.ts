import { z } from "zod";

export const createSprintSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  goal: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateSprintSchema = createSprintSchema
  .partial()
  .omit({ projectId: true });
