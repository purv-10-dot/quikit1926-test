/**
 * Objects and fields exposed in the report builder UI.
 * Only listed group-by keys are accepted by the runner (injection-safe).
 */
import type { CustomReportMetric, CustomReportObjectMeta } from "./types";

export const CUSTOM_REPORT_CATALOG: CustomReportObjectMeta[] = [
  {
    object: "leads",
    label: "Leads",
    dateFieldLabel: "Created date",
    groupByFields: [
      { key: "source", label: "Source" },
      { key: "stage", label: "Stage" },
      { key: "ownerId", label: "Owner" },
    ],
    metrics: [{ key: "count", label: "Record count" }],
  },
  {
    object: "opportunities",
    label: "Opportunities",
    dateFieldLabel: "Created date",
    groupByFields: [
      { key: "stage", label: "Stage" },
      { key: "ownerId", label: "Owner" },
    ],
    metrics: [
      { key: "count", label: "Record count" },
      { key: "sumAmount", label: "Sum of amount" },
    ],
  },
  {
    object: "activities",
    label: "Activities",
    dateFieldLabel: "Occurred at",
    groupByFields: [
      { key: "type", label: "Activity type" },
      { key: "ownerId", label: "Owner" },
    ],
    metrics: [{ key: "count", label: "Record count" }],
  },
  {
    object: "callLogs",
    label: "Call logs",
    dateFieldLabel: "Call time",
    groupByFields: [
      { key: "status", label: "Status" },
      { key: "dispositionName", label: "Disposition" },
      { key: "agentUserId", label: "Agent" },
    ],
    metrics: [
      { key: "count", label: "Call count" },
      { key: "sumDuration", label: "Total talk time (sec)" },
    ],
  },
];

export function getObjectMeta(object: string): CustomReportObjectMeta | undefined {
  return CUSTOM_REPORT_CATALOG.find((o) => o.object === object);
}

export function isAllowedGroupBy(
  object: string,
  groupBy: string,
): groupBy is string {
  const meta = getObjectMeta(object);
  if (!meta) return false;
  return meta.groupByFields.some((f) => f.key === groupBy);
}

export function isAllowedMetric(object: string, metric: string): metric is CustomReportMetric {
  const meta = getObjectMeta(object);
  if (!meta) return false;
  return meta.metrics.some((m) => m.key === metric);
}
