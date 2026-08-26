/**
 * Filter vocabulary for the runner grid's Filter bar (QUIKTR-341).
 *
 * Deliberately NARROWER than the case repository's `CASE_FILTERS`
 * (lib/test/caseFilters.ts): a run's tests already belong to one run, so fields
 * like "Test Run" or "Test Case ID" from that list would be meaningless here.
 * Only what TestRail's own run-level filter offers is included: Status,
 * Assigned To, Priority, Labels.
 */

export const RUNNER_FILTER_KEYS = ["statusId", "assignee", "priority", "label"] as const;
export type RunnerFilterKey = (typeof RUNNER_FILTER_KEYS)[number];

export interface RunnerFilterDef {
  key: RunnerFilterKey;
  label: string;
  /** Where this filter's options come from — resolved by use-filter-sources.ts /
   *  runner-view.tsx, which already load all three for other reasons. */
  source: "statuses" | "people" | "priority" | "labels";
}

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "LOWEST", label: "Lowest" },
];

export const RUNNER_FILTERS: RunnerFilterDef[] = [
  { key: "statusId", label: "Status", source: "statuses" },
  { key: "assignee", label: "Assigned To", source: "people" },
  { key: "priority", label: "Priority", source: "priority" },
  { key: "label", label: "Labels", source: "labels" },
];

export { PRIORITY_OPTIONS };
