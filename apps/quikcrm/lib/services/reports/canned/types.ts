/**
 * Canned report catalog — shared types.
 *
 * The catalog itself is split across category files (`pipeline.ts`,
 * `leads.ts`, etc.) and stitched together in `index.ts` to keep each file
 * small and reviewable. Every entry is a `CannedReport` with a `run`
 * function that returns columns + rows + (optional) chart spec.
 */
import type { SessionUser } from "@/types/permission";

export type CannedReportCategory =
  | "Pipeline"
  | "Leads"
  | "Activities"
  | "Telephony"
  | "Team";

export type CannedReportColumnFormat =
  | "number"
  | "currency"
  | "date"
  | "percent"
  | "duration";

export type CannedReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: CannedReportColumnFormat;
};

export type CannedReportChart = {
  type: "bar" | "line" | "pie";
  xKey: string;
  yKey: string;
};

export type CannedReportTotal = {
  label: string;
  value: number;
  display?: string;
};

export type CannedReportResult = {
  columns: CannedReportColumn[];
  rows: Record<string, unknown>[];
  total?: CannedReportTotal;
  chart?: CannedReportChart;
};

export type DefaultDateRange =
  | "today"
  | "7d"
  | "30d"
  | "thisMonth"
  | "thisQuarter";

export type ReportRunContext = {
  orgId: string;
  session: SessionUser;
  from: Date;
  to: Date;
  ownerId?: string;
  tz: string;
};

export type CannedReport = {
  id: string;
  category: CannedReportCategory;
  title: string;
  blurb: string;
  /**
   * Long-form explanation surfaced through the `?` icon on the card —
   * data source, filters, and any formula / heuristic the report uses.
   * Plain prose, ~2-4 sentences. Falls back to `blurb` when omitted.
   */
  helpText?: string;
  defaultDateRange: DefaultDateRange;
  run: (ctx: ReportRunContext) => Promise<CannedReportResult>;
  /**
   * Builds a URL the user can drill into when they click the row's
   * dimension cell (typically `/leads?stage=…` or `/opportunities/<id>`).
   * Return null when no useful drill target exists for that row.
   */
  buildDrillUrl?: (
    row: Record<string, unknown>,
    ctx: ReportRunContext,
  ) => string | null;
};

export type CannedReportSummary = Pick<
  CannedReport,
  "id" | "category" | "title" | "blurb" | "helpText" | "defaultDateRange"
>;
