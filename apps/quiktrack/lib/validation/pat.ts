import { z } from "zod";

export const createPatSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // Capped lower than the legacy project-scoped max (365) — a user-scoped
  // token can reach every project its creator can, so a leaked one has a
  // larger blast radius and shouldn't stay live as long by default.
  expiresInDays: z.number().int().min(1).max(90),
});
