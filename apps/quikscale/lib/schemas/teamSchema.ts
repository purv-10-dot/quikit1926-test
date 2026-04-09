import { z } from "zod";

export const createTeamSchema = z.object({
  name:        z.string().min(1, "Team name is required").max(100),
  description: z.string().max(500).optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex").default("#0066cc"),
  headId:      z.string().optional().nullable(),
});

export const updateTeamSchema = createTeamSchema.partial().required({ name: true });

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
