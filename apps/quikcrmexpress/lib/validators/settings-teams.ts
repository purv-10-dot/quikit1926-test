import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
  managerId: z.string().trim().min(1).optional().nullable(),
});

export const updateTeamSchema = createTeamSchema.partial();
