import { z } from "zod";

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, "Color must be a 6-digit hex like #2563eb");

export const createChecklistItemSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(255),
  statusId: z.string().min(1).nullish(),
  dueDate: z.string().datetime().nullish(),
});

// All fields optional — a PATCH may touch any subset. `null` explicitly clears
// (statusId / dueDate); `undefined` leaves the column untouched.
export const updateChecklistItemSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    statusId: z.string().min(1).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    isCompleted: z.boolean().optional(),
    orderIndex: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const createChecklistStatusSchema = z.object({
  name: z.string().trim().min(1, "Status name is required").max(40),
  color: hexColor.optional(),
});

export const updateChecklistStatusSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: hexColor.optional(),
    orderIndex: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export type CreateChecklistStatusInput = z.infer<typeof createChecklistStatusSchema>;
export type UpdateChecklistStatusInput = z.infer<typeof updateChecklistStatusSchema>;
