import type { ReportDefinition } from "./types";
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

export function getReport(key: string): ReportDefinition | undefined {
  return byKey.get(key);
}

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

export function reportCatalog() {
  return REPORTS.map(({ key, label, description, category, usesDateRange }) => ({
    key, label, description, category, usesDateRange: !!usesDateRange,
  }));
}
