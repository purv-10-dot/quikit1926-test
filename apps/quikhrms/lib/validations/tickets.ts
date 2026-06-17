import { z } from "zod";

export const ticketPriorityEnum = z.enum(["Low", "Medium", "High", "Urgent"]);
export const ticketStatusEnum = z.enum([
  "Open",
  "InProgress",
  "OnHold",
  "Resolved",
  "Closed",
  "Reopened",
  "Cancelled",
]);
export const ticketSourceEnum = z.enum(["Web", "Mobile", "Email", "API"]);

// ─── Ticket Category ────────────────────────────────────

const slaPairSchema = z.object({
  responseHours: z.number().int().min(1).max(24 * 365),
  resolveHours: z.number().int().min(1).max(24 * 365),
});

export const slaMatrixSchema = z
  .object({
    Low: slaPairSchema.optional(),
    Medium: slaPairSchema.optional(),
    High: slaPairSchema.optional(),
    Urgent: slaPairSchema.optional(),
  })
  .nullable()
  .optional();

export type SlaMatrix = z.infer<typeof slaMatrixSchema>;

export const createTicketCategorySchema = z.object({
  name: z.string().min(1, "Name required"),
  slug: z
    .string()
    .min(1, "Slug required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  defaultAssigneeId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  slaResponseHours: z.number().int().min(1).default(24),
  slaResolveHours: z.number().int().min(1).default(72),
  slaMatrix: slaMatrixSchema,
  autoCloseAfterDays: z.number().int().min(0).max(365).default(7),
  isActive: z.boolean().default(true),
});

export const updateTicketCategorySchema = createTicketCategorySchema.partial();

export type CreateTicketCategoryInput = z.infer<typeof createTicketCategorySchema>;
export type UpdateTicketCategoryInput = z.infer<typeof updateTicketCategorySchema>;

// ─── Ticket ─────────────────────────────────────────────

export const createTicketSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  description: z.string().min(1, "Description required"),
  // Tickets are raised against a department. categoryId stays optional for
  // backward-compat with any legacy category-driven callers.
  departmentId: z.string().min(1, "Department required"),
  categoryId: z.string().min(1).optional(),
  priority: ticketPriorityEnum.default("Medium"),
  source: ticketSourceEnum.default("Web"),
  assignedToId: z.string().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  priority: ticketPriorityEnum.optional(),
  status: ticketStatusEnum.optional(),
  assignedToId: z.string().nullable().optional(),
  resolutionNote: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// ─── Ticket Comment ─────────────────────────────────────

export const createTicketCommentSchema = z.object({
  message: z.string().min(1, "Message required"),
  isInternal: z.boolean().default(false),
});

export type CreateTicketCommentInput = z.infer<typeof createTicketCommentSchema>;

// ─── Ticket Attachment ──────────────────────────────────

export const createTicketAttachmentSchema = z.object({
  // Uploads return a relative proxy path (/api/v1/hrms/uploads/proxy?key=…),
  // not an absolute URL — accept either, matching the documents schema.
  fileUrl: z.string().refine(
    (v) => /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Valid URL required" },
  ),
  fileName: z.string().min(1, "Filename required"),
  fileType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
});

export type CreateTicketAttachmentInput = z.infer<typeof createTicketAttachmentSchema>;
