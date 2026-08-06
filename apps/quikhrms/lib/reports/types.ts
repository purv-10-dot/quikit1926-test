// Report engine type contracts. Each report is a declarative ReportDefinition whose
// run() pulls tenant-scoped data and returns columns + rows; the engine renders those
// to CSV / XLSX / PDF. Adding a report = adding one definition, no engine changes.

export const REPORT_CATEGORIES = [
  "Organization",
  "Payroll",
  "Statutory",
  "Tax",
  "Attendance",
  "Leave",
  "Loans & Expenses",
  "Recruitment",
  "Lifecycle",
  "Performance",
  "Assets & Documents",
  "Audit",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportColumn {
  key: string; // property on each row object
  label: string; // header shown in export
  width?: number; // xlsx char-width / pdf weight hint
  money?: boolean; // render as currency-style number
}

export interface ReportContext {
  orgId: string;
  dateFrom?: Date;
  dateTo?: Date;
  filters?: Record<string, unknown>;
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  meta?: Record<string, unknown>; // optional totals / period label for the UI
}

export interface ReportDefinition {
  key: string; // unique slug, e.g. "payroll-register"
  label: string;
  description: string;
  category: ReportCategory;
  usesDateRange?: boolean; // UI hint: show the From/To pickers for this report
  /**
   * Permission required to RUN this report. When omitted, the registry derives
   * it from the category (see reportRequiredPermission) — sensitive categories
   * (Payroll/Statutory/Tax) default to the elevated hrms.reports.manage.
   */
  requiredPermission?: string;
  run: (ctx: ReportContext) => Promise<ReportResult>;
}
