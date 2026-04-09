import { z } from "zod";

export const createWWWSchema = z.object({
  who:             z.string().min(1, "Owner is required"),
  what:            z.string().min(1, "What is required").max(500),
  when:            z.string().min(1, "Due date is required"),
  status:          z.enum(["not-yet-started","in-progress","completed","blocked","not-applicable"]).default("not-yet-started"),
  notes:           z.string().max(2000).optional().nullable(),
  category:        z.string().max(100).optional().nullable(),
  originalDueDate: z.string().optional().nullable(),
});

export const updateWWWSchema = createWWWSchema.partial().required({ what: true });

export type CreateWWWInput = z.infer<typeof createWWWSchema>;
export type UpdateWWWInput = z.infer<typeof updateWWWSchema>;
