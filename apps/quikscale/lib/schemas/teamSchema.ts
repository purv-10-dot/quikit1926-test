import { z } from "zod";

// String length caps on user-content fields lifted — Prisma columns are `text`.
// `color` regex stays (hex format guard, not a length cap).
export const createTeamSchema = z.object({
  name:        z.string().min(1, "Team name is required"),
  description: z.string().optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex").default("#0066cc"),
  headId:      z.string().optional().nullable(),
});

// Update: all fields optional — partial patches are the common case.
export const updateTeamSchema = z.object({
  name:        z.string().min(1, "Team name is required").optional(),
  description: z.string().optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color hex").optional(),
  headId:      z.string().optional().nullable(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
