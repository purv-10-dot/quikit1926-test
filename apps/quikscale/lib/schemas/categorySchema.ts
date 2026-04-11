import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(200),
  dataType: z.enum(["Number", "Percentage", "Currency"]),
  currency: z.string().max(10).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  dataType: z.enum(["Number", "Percentage", "Currency"]).optional(),
  currency: z.string().max(10).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
