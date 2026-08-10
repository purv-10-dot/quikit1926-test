import { z } from "zod";

const DocumentCategoryEnum = z.enum([
  "OfferLetter", "Policy", "IdProof", "Certificate", "Contract",
  "AppointmentLetter", "ExperienceLetter", "RelievingLetter", "NDA", "Insurance", "Other",
]);

const DocumentStatusEnum = z.enum(["Draft", "Active", "Archived", "Expired"]);

// ─── Documents ──────────────────────────────────────────

export const createDocumentSchema = z.object({
  employeeId: z.string().optional().nullable(),
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  category: DocumentCategoryEnum.default("Other"),
  fileUrl: z.string().refine(
    (v) => /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Invalid file URL" },
  ),
  fileType: z.string().min(1),
  fileSize: z.number().int().min(0).default(0),
  isTemplate: z.boolean().default(false),
  status: DocumentStatusEnum.default("Active"),
  expiryDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  parentDocumentId: z.string().optional().nullable(),
});

export const bulkCreateDocumentSchema = z.object({
  documents: z.array(createDocumentSchema).min(1),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: DocumentCategoryEnum.optional(),
  status: DocumentStatusEnum.optional(),
  expiryDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fileUrl: z.string().refine(
    (v) => !v || /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Must be absolute URL or relative path" },
  ).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().min(0).optional(),
  fileType: z.string().optional(),
});

// (Document Template schemas removed with the Document Templates feature — 2026-06-04.)

// ─── Acknowledgment ─────────────────────────────────────

export const acknowledgeDocumentSchema = z.object({
  action: z.enum(["Acknowledged", "Declined"]).default("Acknowledged"),
  signature: z.string().optional(),
  declineReason: z.string().optional(),
});

// ─── Share ──────────────────────────────────────────────

export const shareDocumentSchema = z.object({
  sharedWith: z.array(z.string()).min(1, "At least one recipient"),
  accessLevel: z.enum(["View", "Download"]).default("View"),
  expiresAt: z.string().optional().nullable(),
}).refine(
  (d) => !d.expiresAt || new Date(d.expiresAt).getTime() > Date.now(),
  { message: "Link expiry must be in the future", path: ["expiresAt"] },
);
