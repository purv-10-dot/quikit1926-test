import { z } from "zod";

// ─── Notification Templates ─────────────────────────────


// ─── Reports ────────────────────────────────────────────

export const ReportTypeEnum = z.enum([
  "Headcount", "Attrition", "Attendance", "ExpenseSummary",
  "LeaveBalance", "Recruitment", "Performance", "Custom",
]);

export const ReportFormatEnum = z.enum(["PDF", "XLSX", "CSV", "JSON"]);

export const generateReportSchema = z.object({
  name: z.string().min(1),
  type: ReportTypeEnum,
  parameters: z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    departmentId: z.string().optional(),
    employeeIds: z.array(z.string()).optional(),
    groupBy: z.string().optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  format: ReportFormatEnum.default("JSON"),
});

export const scheduleReportSchema = z.object({
  name: z.string().min(1),
  type: ReportTypeEnum,
  scheduleCron: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
  format: ReportFormatEnum.default("XLSX"),
  recipients: z.array(z.string().email()).optional(),
});

// ─── Dashboards ─────────────────────────────────────────

export const widgetSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["metric", "bar", "line", "pie", "table", "list", "calendar"]),
  title: z.string(),
  dataSource: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
});

export const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  widgets: z.array(widgetSchema).default([]),
  roleAccess: z.array(z.string()).optional(),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(false),
});

export const updateDashboardSchema = createDashboardSchema.partial();

// ─── Audit Export ───────────────────────────────────────

export const exportAuditSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  actorId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  format: z.enum(["CSV", "JSON"]).default("CSV"),
});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
