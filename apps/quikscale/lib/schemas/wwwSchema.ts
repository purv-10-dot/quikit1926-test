import { z } from "zod";

export const createWWWSchema = z.object({
  who:             z.string().min(1, "Owner is required"),
  what:            z.string().min(1, "What is required").max(500),
  when:            z.string().min(1, "Due date is required"),
  status:          z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","in-progress","blocked"]).default("not-yet-started"),
  notes:           z.string().max(2000).optional().nullable(),
  category:        z.string().max(100).optional().nullable(),
  originalDueDate: z.string().optional().nullable(),
});

// Update — fully partial so PATCH-style updates work. Length/enum rules
// still enforced when the field is present.
export const updateWWWSchema = z.object({
  who:             z.string().min(1).optional(),
  what:            z.string().min(1).max(500).optional(),
  when:            z.string().min(1).optional(),
  status:          z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","in-progress","blocked"]).optional(),
  notes:           z.string().max(2000).optional().nullable(),
  category:        z.string().max(100).optional().nullable(),
  originalDueDate: z.string().optional().nullable(),
  revisedDates:    z.array(z.string()).optional(),
});

export type CreateWWWInput = z.infer<typeof createWWWSchema>;
export type UpdateWWWInput = z.infer<typeof updateWWWSchema>;
