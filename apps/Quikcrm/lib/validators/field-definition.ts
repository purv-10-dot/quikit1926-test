import { z } from "zod";

export const fieldTypeEnum = z.enum([
  "Text",
  "TextArea",
  "Number",
  "Email",
  "Phone",
  "Date",
  "Boolean",
  "Select",
  "MultiSelect",
]);

export const requirementEnum = z.enum(["Required", "Optional", "System"]);

const fieldDefinitionBaseSchema = z.object({
  key: z.string().min(1).max(41),
  label: z.string().min(1).max(80),
  fieldType: fieldTypeEnum,
  requirement: requirementEnum.default("Optional"),
  visible: z.boolean().default(true),
  showInList: z.boolean().default(false),
  helpText: z.string().max(200).optional().nullable(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.array(z.string().min(1).max(80)).optional(),
});

const requireOptionsForSelect = (
  val: { fieldType?: z.infer<typeof fieldTypeEnum>; options?: string[] },
  ctx: z.RefinementCtx,
) => {
  if ((val.fieldType === "Select" || val.fieldType === "MultiSelect") && (!val.options || val.options.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Select / MultiSelect fields require at least one option",
    });
  }
};

export const fieldDefinitionCreateSchema = fieldDefinitionBaseSchema.superRefine(requireOptionsForSelect);

export const fieldDefinitionPatchSchema = fieldDefinitionBaseSchema.partial().superRefine(requireOptionsForSelect);

export type FieldDefinitionCreateInput = z.infer<typeof fieldDefinitionCreateSchema>;
