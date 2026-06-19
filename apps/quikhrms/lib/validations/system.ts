import { z } from "zod";

// (Workflow Rule schemas removed with the workflow engine — 2026-06-04.)



// ─── Report Generation ──────────────────────────────────

export const generateReportSchema = z.object({
  templateId: z.string().optional(),
  category: z.string().optional(),
  // `key` targets the report registry (new engine); `entity` kept for back-compat.
  key: z.string().optional(),
  entity: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  groupBy: z.string().optional(),
  format: z.enum(["json", "csv", "xlsx", "pdf"]).default("json"),
}).refine((d) => d.key || d.entity, { message: "key or entity is required" });

// ─── Data Import ────────────────────────────────────────

export const createImportSchema = z.object({
  entityType: z.enum(["employees", "departments", "designations", "leaves", "attendance"]),
  fileName: z.string().min(1),
  data: z.array(z.record(z.string(), z.unknown())).min(1),
});

// ─── Notifications ──────────────────────────────────────

export const createNotificationSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["Info", "Warning", "Success", "Error", "Action"]).default("Info"),
  title: z.string().min(1),
  message: z.string().min(1),
  link: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});
