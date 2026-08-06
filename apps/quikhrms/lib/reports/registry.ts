import type { ReportDefinition, ReportCategory } from "./types";
import { orgReports } from "./definitions/org";
import { payrollReports } from "./definitions/payroll";
import { statutoryReports } from "./definitions/statutory";
import { taxReports } from "./definitions/tax";
import { attendanceReports } from "./definitions/attendance";
import { leaveReports } from "./definitions/leave";
import { loansReports } from "./definitions/loans";
import { recruitmentReports } from "./definitions/recruitment";
import { lifecycleReports } from "./definitions/lifecycle";
import { performanceReports } from "./definitions/performance";
import { assetsDocsReports } from "./definitions/assets-docs";
import { auditReports } from "./definitions/audit";

export const REPORTS: ReportDefinition[] = [
  ...orgReports,
  ...payrollReports,
  ...statutoryReports,
  ...taxReports,
  ...attendanceReports,
  ...leaveReports,
  ...loansReports,
  ...recruitmentReports,
  ...lifecycleReports,
  ...performanceReports,
  ...assetsDocsReports,
  ...auditReports,
];

const byKey = new Map(REPORTS.map((r) => [r.key, r]));

/** Legacy `entity` values from the old reports page → new registry keys. */
const ENTITY_ALIASES: Record<string, string> = {
  employees: "employee-master",
  attendance: "attendance-daily-register",
  leaves: "leave-transactions",
  recruitment: "recruitment-funnel",
};

export function resolveReport(keyOrEntity: string): ReportDefinition | undefined {
  return byKey.get(keyOrEntity) ?? byKey.get(ENTITY_ALIASES[keyOrEntity] ?? "");
}

/**
 * Permission needed to RUN a report. Sensitive categories (full comp + PII)
 * require the elevated hrms.reports.manage; the audit report reuses the audit
 * permission; everything else needs the base hrms.reports.read. A definition
 * may override via `requiredPermission`.
 */
const CATEGORY_PERMISSION: Record<ReportCategory, string> = {
  Organization: "hrms.reports.read",
  Payroll: "hrms.reports.manage",
  Statutory: "hrms.reports.manage",
  Tax: "hrms.reports.manage",
  Attendance: "hrms.reports.read",
  Leave: "hrms.reports.read",
  "Loans & Expenses": "hrms.reports.read",
  Recruitment: "hrms.reports.read",
  Lifecycle: "hrms.reports.read",
  Performance: "hrms.reports.read",
  "Assets & Documents": "hrms.reports.read",
  Audit: "hrms.audit.read",
};

export function reportRequiredPermission(r: ReportDefinition): string {
  return r.requiredPermission ?? CATEGORY_PERMISSION[r.category] ?? "hrms.reports.read";
}

/** True when the caller's permissions allow running this report. */
export function canRunReport(r: ReportDefinition, permissions: string[]): boolean {
  return permissions.includes("*") || permissions.includes(reportRequiredPermission(r));
}

/**
 * Catalog for the UI. When `permissions` is passed, only reports the caller may
 * actually run are returned (so the list stops leaking sensitive report names).
 */
export function reportCatalog(permissions?: string[]) {
  const visible = permissions ? REPORTS.filter((r) => canRunReport(r, permissions)) : REPORTS;
  return visible.map((r) => ({
    key: r.key, label: r.label, description: r.description, category: r.category,
    usesDateRange: !!r.usesDateRange,
    requiredPermission: reportRequiredPermission(r),
  }));
}
