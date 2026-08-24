/**
 * The test-case filter vocabulary — ONE definition, shared by the API and the UI.
 *
 * Every filter is declared here with its kind and, for enum filters, its options. The
 * query schema and the filter panel are both generated from this list, so a new filter
 * cannot exist on one side only. The previous list endpoint accepted four single-value
 * filters that no UI ever sent; that drift is what this file prevents.
 *
 * Kinds:
 *   enum   — pick from a fixed vocabulary, multi-select, matches ANY (`in`)
 *   text   — substring match, case-insensitive
 *   ref    — a numeric case id, matched exactly (TC-1042 → 1042)
 *   person — a project member id, plus the special "unassigned" sentinel
 *   id     — an opaque cuid picked from a loaded list (labels, runs, statuses)
 *   date   — an inclusive from/to range on a timestamp column
 *   flag   — a yes/no question about a relation ("has coverage", "has a defect")
 */

export const UNASSIGNED = "__unassigned__";

/** Every filter key. Used as the URL param name and the React state key. */
export const CASE_FILTER_KEYS = [
  "ref",
  "title",
  "priority",
  "type",
  "automation",
  "candidate",
  "approval",
  "assignee",
  "label",
  "reference",
  "coverage",
  "execution",
  "run",
  "defect",
  "createdBy",
  "createdFrom",
  "createdTo",
  "updatedFrom",
  "updatedTo",
] as const;

export type CaseFilterKey = (typeof CASE_FILTER_KEYS)[number];

export interface FilterOption {
  value: string;
  label: string;
  color?: string;
}

export interface FilterDef {
  key: CaseFilterKey;
  label: string;
  kind: "enum" | "text" | "ref" | "person" | "id" | "date" | "flag";
  /** Static vocabulary for `enum`/`flag`. Dynamic sources are loaded by the panel. */
  options?: FilterOption[];
  /** Where an `id` filter's options come from. */
  source?: "labels" | "runs" | "statuses";
  /** Groups the two halves of a date range under one heading. */
  rangeOf?: "created" | "updated";
  placeholder?: string;
  hint?: string;
}

const PRIORITY: FilterOption[] = [
  { value: "CRITICAL", label: "Critical", color: "#be123c" },
  { value: "HIGH", label: "High", color: "#c2410c" },
  { value: "MEDIUM", label: "Medium", color: "#1d4ed8" },
  { value: "LOW", label: "Low", color: "#4b5563" },
  { value: "LOWEST", label: "Lowest", color: "#9ca3af" },
];

const TYPE: FilterOption[] = [
  { value: "FUNCTIONAL", label: "Functional" },
  { value: "REGRESSION", label: "Regression" },
  { value: "SMOKE", label: "Smoke" },
  { value: "SANITY", label: "Sanity" },
  { value: "INTEGRATION", label: "Integration" },
  { value: "UI", label: "UI" },
  { value: "API", label: "API" },
  { value: "DATABASE", label: "Database" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "SECURITY", label: "Security" },
  { value: "COMPATIBILITY", label: "Compatibility" },
  { value: "POSITIVE", label: "Positive" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "BOUNDARY_VALUE", label: "Boundary Value" },
  { value: "USABILITY", label: "Usability" },
  { value: "ACCESSIBILITY", label: "Accessibility" },
  { value: "EXPLORATORY", label: "Exploratory" },
  { value: "BDD", label: "BDD / Gherkin" },
];

/**
 * The filter list, in panel order. Grouped roughly as the ticket lists them:
 * identity, classification, ownership, relationships, execution, audit.
 */
export const CASE_FILTERS: FilterDef[] = [
  {
    key: "ref",
    label: "Test case ID",
    kind: "ref",
    placeholder: "TC-1042 or 1042",
    hint: "Exact id. The TC- prefix is optional.",
  },
  { key: "title", label: "Title", kind: "text", placeholder: "Contains…" },
  { key: "priority", label: "Priority", kind: "enum", options: PRIORITY },
  { key: "type", label: "Type", kind: "enum", options: TYPE },
  {
    key: "automation",
    label: "Automation",
    kind: "enum",
    options: [
      { value: "MANUAL", label: "Manual" },
      { value: "AUTOMATED", label: "Automated" },
    ],
  },
  {
    key: "candidate",
    label: "Automation candidate",
    kind: "enum",
    // NONE and "never assessed" are different states in the data: NONE was recorded
    // deliberately, NULL was never looked at. Both are offered so neither is
    // unreachable.
    options: [
      { value: "YES", label: "Yes" },
      { value: "NO", label: "No" },
      { value: "NONE", label: "Not assessed" },
      { value: UNASSIGNED, label: "Never set" },
    ],
  },
  {
    key: "approval",
    label: "Approval status",
    kind: "enum",
    options: [
      { value: "DRAFT", label: "Draft" },
      { value: "IN_REVIEW", label: "In review" },
      { value: "APPROVED", label: "Approved" },
      { value: "DEPRECATED", label: "Deprecated" },
    ],
  },
  {
    key: "assignee",
    label: "Assignee",
    kind: "person",
    hint: "The case owner. A run's per-test assignee is separate.",
  },
  {
    key: "label",
    label: "Labels",
    kind: "id",
    source: "labels",
    hint: "Matches a case carrying ANY of the chosen labels.",
  },
  {
    key: "reference",
    label: "References",
    kind: "text",
    placeholder: "Work item key…",
    hint: "Searches the case's References text.",
  },
  {
    key: "coverage",
    label: "Coverage",
    kind: "flag",
    options: [
      { value: "yes", label: "Covers a work item" },
      { value: "no", label: "Covers nothing" },
    ],
  },
  {
    key: "execution",
    label: "Execution status",
    kind: "id",
    source: "statuses",
    hint: "Matches if the case has that result in ANY run. Add a Test Run to narrow it.",
  },
  { key: "run", label: "Test run", kind: "id", source: "runs" },
  {
    key: "defect",
    label: "Defect",
    kind: "flag",
    options: [
      { value: "yes", label: "Has a linked defect" },
      { value: "no", label: "No linked defect" },
    ],
    hint: "A defect linked to any of the case's results.",
  },
  { key: "createdBy", label: "Created by", kind: "person" },
  { key: "createdFrom", label: "Created after", kind: "date", rangeOf: "created" },
  { key: "createdTo", label: "Created before", kind: "date", rangeOf: "created" },
  { key: "updatedFrom", label: "Updated after", kind: "date", rangeOf: "updated" },
  { key: "updatedTo", label: "Updated before", kind: "date", rangeOf: "updated" },
];

export const FILTER_BY_KEY: Record<CaseFilterKey, FilterDef> = Object.fromEntries(
  CASE_FILTERS.map((f) => [f.key, f]),
) as Record<CaseFilterKey, FilterDef>;

/** Multi-value filters serialise as `a,b,c`; the rest are single values. */
export function isMultiFilter(def: FilterDef): boolean {
  return def.kind === "enum" || def.kind === "person" || def.kind === "id";
}

/**
 * A case id typed by a human. Accepts "TC-1042", "tc 1042" and "1042" — the grid
 * renders the prefixed form, so requiring the bare number would reject the very
 * string the user just copied out of the ID column.
 */
export function parseCaseRef(raw: string): number | null {
  const m = /^\s*(?:tc[\s-]*)?(\d{1,9})\s*$/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
