/**
 * Custom report definitions — Salesforce/HubSpot-style "pick object,
 * group by, metric" without persisting to DB (run-on-demand).
 */
import type { CannedReportResult } from "../canned/types";

export type CustomReportObject = "leads" | "opportunities" | "activities" | "callLogs";

export type CustomReportMetric = "count" | "sumAmount" | "sumDuration";

export const customReportDefinitionSchema = {
  object: ["leads", "opportunities", "activities", "callLogs"] as const,
  groupBy: "string",
  metric: ["count", "sumAmount", "sumDuration"] as const,
};

export type CustomReportDefinition = {
  object: CustomReportObject;
  /** Field name on the Prisma model to groupBy. */
  groupBy: string;
  metric: CustomReportMetric;
  title?: string;
};

export type CustomReportFieldOption = {
  key: string;
  label: string;
};

export type CustomReportObjectMeta = {
  object: CustomReportObject;
  label: string;
  groupByFields: CustomReportFieldOption[];
  metrics: { key: CustomReportMetric; label: string }[];
  dateFieldLabel: string;
};

export type CustomReportRunOutput = CannedReportResult & {
  definition: CustomReportDefinition;
};
