import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

// CrmTaskStatus enum currently lacks "Waiting" — schema sits in
// packages/database which is locked to integration owner. Tracked for the
// follow-up PR; UI hides "Waiting" until the enum lands.
export const TASK_STATUSES = ["Open", "InProgress", "Completed", "Cancelled"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;
export const TASK_RELATED_KINDS = ["Lead", "Opportunity", "Contact", "Account"] as const;

export const SMART_VIEW_KEYS = [
  "bd_manager_review",
  "client_meeting",
  "intro_call",
  "outreach",
  "follow_up",
] as const;

export const DUE_PRESETS = ["overdue", "today", "tomorrow", "this_week", "next_week", "no_date"] as const;

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid ISO date" });

export const createTaskSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  taskType: z.string().trim().max(120).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: isoDate.optional().nullable(),
  assignedToUserId: z.string().trim().min(1).optional().nullable(),
  relatedKind: z.enum(TASK_RELATED_KINDS).optional().nullable(),
  relatedObjectId: z.string().trim().min(1).optional().nullable(),
  leadId: z.string().trim().min(1).optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  // Echoed by the modal when the user picks Cancelled — saved into the
  // status-change activity row's detailNotes since CrmTask has no
  // cancellationReason column yet.
  cancellationReason: z.string().trim().max(2000).optional().nullable(),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  relatedKind: z.enum(TASK_RELATED_KINDS).optional(),
  relatedObjectId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
  smartView: z.enum(SMART_VIEW_KEYS).optional(),
  duePreset: z.enum(DUE_PRESETS).optional(),
  assignedContains: z.string().trim().min(1).optional(),
  assignedToUserId: z.string().trim().min(1).optional(),
  mine: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
  // Back-compat: original GET supported a flat `limit` param. When given,
  // override pageSize and force page 1 — preserves existing callers like
  // the My Day view which fetches up to 100 same-day items in a single shot.
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const advancedFilterSchema = z.object({
  status: z.array(z.enum(TASK_STATUSES)).optional(),
  priority: z.array(z.enum(TASK_PRIORITIES)).optional(),
  relatedKind: z.array(z.enum(TASK_RELATED_KINDS)).optional(),
  assignedToUserId: z.array(z.string().min(1)).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  q: z.string().trim().min(1).optional(),
  smartView: z.enum(SMART_VIEW_KEYS).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const snoozeSchema = z
  .object({
    minutes: z.number().int().positive().optional(),
    until: isoDate.optional(),
  })
  .refine((v) => v.minutes != null || v.until != null, {
    message: "Either minutes or until is required",
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type AdvancedFilterInput = z.infer<typeof advancedFilterSchema>;
export type SnoozeInput = z.infer<typeof snoozeSchema>;
