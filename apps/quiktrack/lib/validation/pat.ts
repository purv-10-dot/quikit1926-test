import { z } from "zod";

export const createPatSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  expiresInDays: z.number().int().min(1).max(365),
});
