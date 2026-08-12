/**
 * Objects and fields exposed in the report builder UI.
 *
 * This catalog IS the security boundary: only listed group-by keys, filter
 * fields, and metrics are accepted by the runner (injection-safe). Anything a
 * client sends that isn't here is rejected/ignored before it reaches Prisma.
 */
import type {
  CustomReportChartType,
  CustomReportFieldOption,
  CustomReportFieldType,
  CustomReportMetric,
  CustomReportObjectMeta,
  ReportFilterOperator,
} from "./types";

/** Time-bucket group-by options, derived from each object's date field. */
export function dateBucketGroupBys(dateLabel: string): CustomReportFieldOption[] {
  return [
    { key: "date:day", label: `${dateLabel} · Day` },
    { key: "date:week", label: `${dateLabel} · Week` },
    { key: "date:month", label: `${dateLabel} · Month` },
    { key: "date:quarter", label: `${dateLabel} · Quarter` },
  ];
}

/** Allowed operators per field type — shared by the UI and runner validation. */
export function operatorsForFieldType(
  type: CustomReportFieldType,
): ReportFilterOperator[] {
  switch (type) {
    case "number":
      return ["equals", "not_equals", "gt", "gte", "lt", "lte"];
    case "date":
      return ["gte", "lte", "gt", "lt"];
    case "boolean":
      return ["equals"];
    case "enum":
      return ["equals", "not_equals", "in", "is_empty", "is_not_empty"];
    case "user":
      // Value is a user id picked from a dropdown — equality + presence only.
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
    default:
      return ["equals", "not_equals", "contains", "in", "is_empty", "is_not_empty"];
  }
}

export const CUSTOM_REPORT_CATALOG: CustomReportObjectMeta[] = [
  {
    object: "leads",
    label: "Leads",
    dateFieldLabel: "Created date",
    dateField: "createdAt",
    groupByFields: [
      { key: "source", label: "Source" },
      { key: "stage", label: "Stage" },
      { key: "ownerId", label: "Owner" },
      ...dateBucketGroupBys("Created date"),
    ],
    filterFields: [
      { key: "source", label: "Source", type: "string" },
      { key: "stage", label: "Stage", type: "string" },
      { key: "status", label: "Status", type: "string" },
      { key: "company", label: "Company", type: "string" },
      { key: "country", label: "Country", type: "string" },
      { key: "score", label: "Score", type: "number" },
      { key: "isDisengaged", label: "Disengaged", type: "boolean" },
      { key: "ownerId", label: "Owner", type: "user" },
    ],
    metrics: [
      { key: "count", label: "Record count" },
      { key: "avgScore", label: "Average score" },
      { key: "sumScore", label: "Sum of score" },
    ],
  },
  {
    object: "opportunities",
    label: "Opportunities",
    dateFieldLabel: "Created date",
    dateField: "createdAt",
    groupByFields: [
      { key: "stage", label: "Stage" },
      { key: "ownerId", label: "Owner" },
      ...dateBucketGroupBys("Created date"),
    ],
    filterFields: [
      { key: "stage", label: "Stage", type: "enum" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "weightedAmount", label: "Weighted amount", type: "number" },
      { key: "ownerId", label: "Owner", type: "user" },
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
    dateField: "occurredAt",
    groupByFields: [
      { key: "type", label: "Activity type" },
      { key: "ownerId", label: "Owner" },
      ...dateBucketGroupBys("Occurred at"),
    ],
    filterFields: [
      { key: "type", label: "Activity type", type: "string" },
      { key: "ownerId", label: "Owner", type: "user" },
    ],
    metrics: [{ key: "count", label: "Record count" }],
  },
  {
    object: "callLogs",
    label: "Call logs",
    dateFieldLabel: "Call time",
    dateField: "createdAt",
    groupByFields: [
      { key: "status", label: "Status" },
      { key: "dispositionName", label: "Disposition" },
      { key: "agentUserId", label: "Agent" },
      ...dateBucketGroupBys("Call time"),
    ],
    filterFields: [
      { key: "status", label: "Status", type: "string" },
      { key: "dispositionName", label: "Disposition", type: "string" },
      { key: "durationSec", label: "Talk time (sec)", type: "number" },
      { key: "agentUserId", label: "Agent", type: "user" },
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

/** Look up a filter field's metadata (returns undefined if not whitelisted). */
export function getFilterField(object: string, field: string) {
  return getObjectMeta(object)?.filterFields.find((f) => f.key === field);
}

const CHART_TYPES: CustomReportChartType[] = ["auto", "bar", "line", "pie"];
export function isAllowedChartType(value: string): value is CustomReportChartType {
  return (CHART_TYPES as string[]).includes(value);
}
