import { z } from "zod";

/**
 * Idea request validation. `values` is a partial fieldId → value map for the
 * idea's custom fields (Theme/Impact/Effort/Reach/Confidence/Roadmap/…); the
 * computed Score is dropped server-side (see writeIdeaValues).
 */

// A single custom-field value as exchanged over the API — mirrors the registry's
// FieldValue union (string | number | boolean | string[] | null).
const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

const valuesSchema = z.record(fieldValueSchema);

export const createIdeaSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(20000).optional(),
  statusId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  values: valuesSchema.optional(),
});

export const updateIdeaSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(20000).nullable().optional(),
    statusId: z.string().min(1).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    archivedFlag: z.boolean().optional(),
    orderIndex: z.number().int().optional(),
    values: valuesSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;
export type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;
