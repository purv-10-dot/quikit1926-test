import { CASE_FILTERS, type FilterDef } from "@/lib/test/caseFilters";

/**
 * The "Selection Filter" sidebar's field list for `SelectCasesModal`
 * (QUIKTR-341) — a SUBSET of the case repository's full `CASE_FILTERS`.
 *
 * Fields tied to execution (Execution Status, Test Run, Defect, Coverage) or
 * to case identity/audit (Test Case ID, References, Created/Updated dates) are
 * excluded: they answer questions about a case's HISTORY, which is irrelevant
 * while deciding what to put INTO a run. Only the fields that describe what a
 * case IS — its classification and ownership — are offered here, matching the
 * reference UI's own sidebar (Priority, Labels, Assigned To, Automation
 * Candidate, Automation Type, AI fields, Type, Estimate, Forecast, Is
 * Automated, Created By, Created On) minus the ones this app doesn't track.
 */
const PICKER_FILTER_KEYS = [
  "priority",
  "type",
  "automation",
  "candidate",
  "approval",
  "assignee",
  "label",
] as const;

export const PICKER_FILTERS: FilterDef[] = CASE_FILTERS.filter((f) =>
  (PICKER_FILTER_KEYS as readonly string[]).includes(f.key),
);
