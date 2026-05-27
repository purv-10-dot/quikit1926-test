import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "color must be #RRGGBB or #RRGGBBAA");

export const createGroupSchema = z.object({
  name: z.string().min(1).max(64),
  color: hexColor.optional(),
  icon: z.string().min(1).max(64).optional(),
});

export const updateGroupSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    color: hexColor.optional(),
    icon: z.string().min(1).max(64).nullable().optional(),
    isCollapsed: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "no fields to update" });

export const reorderGroupsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const moveTaskSchema = z.object({
  issueId: z.string().min(1),
  toGroupId: z.string().min(1).nullable(),
  toIndex: z.number().int().min(0),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type ReorderGroupsInput = z.infer<typeof reorderGroupsSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
