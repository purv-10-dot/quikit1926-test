/**
 * Custom report definitions — Salesforce/HubSpot-style "pick object,
 * group by, metric" without persisting to DB (run-on-demand).
 */
import type { CannedReportResult } from "../canned/types";

export type CustomReportObject = "leads" | "opportunities" | "activities" | "callLogs";

export type CustomReportMetric =
  | "count"
  | "sumAmount"
  | "sumDuration"
  | "avgScore"
  | "sumScore";

/** Chart shapes the builder can request; "auto" lets the runner choose. */
export type CustomReportChartType = "auto" | "bar" | "line" | "pie";

/** Field value types — drive which filter operators are offered. */
export type CustomReportFieldType =
  | "string"
  | "enum"
  | "number"
  | "date"
  | "boolean"
  | "user";

export type ReportFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty";

export type ReportFilter = {
  /** Must match a `filterFields` key in the object's catalog meta. */
  field: string;
  operator: ReportFilterOperator;
  /** Raw string from the UI; coerced by field type in the runner. */
  value?: string;
};

export const customReportDefinitionSchema = {
  object: ["leads", "opportunities", "activities", "callLogs"] as const,
  groupBy: "string",
  metric: ["count", "sumAmount", "sumDuration", "avgScore", "sumScore"] as const,
};

export type CustomReportDefinition = {
  object: CustomReportObject;
  /**
   * Either a categorical field key from `groupByFields`, or a time-bucket
   * dimension of the form `date:day|week|month|quarter` (buckets the object's
   * `dateField` in the user's timezone).
   */
  groupBy: string;
  metric: CustomReportMetric;
  title?: string;
  /** Whitelisted field filters (re-validated against the catalog at run time). */
  filters?: ReportFilter[];
  /** Preferred chart shape; defaults to "auto". */
  chartType?: CustomReportChartType;
};

export type CustomReportFieldOption = {
  key: string;
  label: string;
};

export type CustomReportFilterField = {
  key: string;
  label: string;
  type: CustomReportFieldType;
};

export type CustomReportObjectMeta = {
  object: CustomReportObject;
  label: string;
  groupByFields: CustomReportFieldOption[];
  metrics: { key: CustomReportMetric; label: string }[];
  dateFieldLabel: string;
  /** Prisma field the date range + time buckets operate on. */
  dateField: string;
  /** Fields the builder may filter on (the filter whitelist). */
  filterFields: CustomReportFilterField[];
};

export type CustomReportRunOutput = CannedReportResult & {
  definition: CustomReportDefinition;
};
