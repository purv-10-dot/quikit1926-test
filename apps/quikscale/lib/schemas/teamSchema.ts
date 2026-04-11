import { z } from "zod";

export const createTeamSchema = z.object({
  name:        z.string().min(1, "Team name is required").max(100),
  description: z.string().max(500).optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex").default("#0066cc"),
  headId:      z.string().optional().nullable(),
});

// Update: all fields optional — partial patches are the common case.
// When `name` is present it still must meet the length rules.
export const updateTeamSchema = z.object({
  name:        z.string().min(1, "Team name is required").max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex").optional(),
  headId:      z.string().optional().nullable(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
