import { z } from "zod";

const notInPastDueDate = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) => {
      if (!v) return true;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    },
    { message: "Due date cannot be in the past" },
  );

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title required").max(255),
  description: z.string().optional().nullable(),
  taskListId: z.string().optional().nullable(),
  assigneeId: z.string().min(1, "Assignee required"),
  requestedFor: z.string().optional().nullable(),
  dueDate: notInPastDueDate,
  priority: z.enum(["Low", "Normal", "High", "Urgent"]).default("Normal"),
  groupKey: z.string().optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  taskListId: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]).optional(),
  status: z.enum(["Open", "InProgress", "Completed", "Cancelled"]).optional(),
});

export const addTaskCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const upsertTaskListSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});
