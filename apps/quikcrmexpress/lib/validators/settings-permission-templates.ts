import { z } from "zod";
import { isCrmModule } from "@/lib/api/permissions-registry";

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
  // Reject unknown modules: a template row for a module the backend doesn't
  // gate on is a silent no-op, which hides misconfiguration from admins.
  module: z
    .string()
    .min(1)
    .refine(isCrmModule, { message: "Unknown module" }),
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
