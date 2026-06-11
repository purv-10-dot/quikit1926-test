import { z } from "zod";

const moduleActionEnum = z.enum([
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "markComplete",
]);

const modulePermRowSchema = z.object({
  module: z.string().min(1),
  actions: z.array(moduleActionEnum),
  hiddenFields: z.array(z.string()).default([]),
  restrictedFields: z.array(z.string()).default([]),
});

export const createPermissionTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  matrix: z.array(modulePermRowSchema).min(1),
});

export const updatePermissionTemplateSchema = createPermissionTemplateSchema.partial();

export type CreatePermissionTemplateInput = z.infer<typeof createPermissionTemplateSchema>;
