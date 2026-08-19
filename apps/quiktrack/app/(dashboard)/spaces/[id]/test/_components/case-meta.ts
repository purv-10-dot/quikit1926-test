import type { SelectOption } from "@quikit/ui";

/**
 * Static option lists + presentation maps for the case repository.
 *
 * Kept in a sibling `*-meta.ts` (per the app's 300-LOC rule) so the view files
 * stay about behaviour. Values must match `lib/validation/testCase.ts` — these
 * are the same vocabularies, rendered.
 */

export const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "LOWEST", label: "Lowest" },
];

export const TYPE_OPTIONS: SelectOption[] = [
  { value: "FUNCTIONAL", label: "Functional" },
  { value: "REGRESSION", label: "Regression" },
  { value: "SMOKE", label: "Smoke" },
  { value: "UAT", label: "UAT" },
  { value: "SECURITY", label: "Security" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "COMPATIBILITY", label: "Compatibility" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "BDD", label: "BDD / Gherkin" },
  { value: "EXPLORATORY", label: "Exploratory" },
];

export const AUTOMATION_OPTIONS: SelectOption[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "AUTOMATED", label: "Automated" },
];

/**
 * Harnesses offered for an automated case. The column is free text, so this is a
 * convenience list rather than a constraint — a team using something else can
 * still have it stored, it just isn't in the dropdown.
 */
export const AUTOMATION_TOOL_OPTIONS: SelectOption[] = [
  { value: "Playwright", label: "Playwright" },
  { value: "Cypress", label: "Cypress" },
  { value: "Selenium", label: "Selenium" },
  { value: "Pytest", label: "Pytest" },
  { value: "JUnit", label: "JUnit" },
  { value: "TestNG", label: "TestNG" },
  { value: "JMeter", label: "JMeter" },
  { value: "Kiuwan", label: "Kiuwan" },
  { value: "Other", label: "Other" },
];

/** Is a manual case worth automating? Distinct from what IS automated. */
export const AUTOMATION_CANDIDATE_OPTIONS: SelectOption[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NONE", label: "Not assessed" },
];

export const APPROVAL_OPTIONS: SelectOption[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "APPROVED", label: "Approved" },
  { value: "DEPRECATED", label: "Deprecated" },
];

/**
 * Priority colours are semantic data states, so they use fixed Tailwind values
 * rather than `accent-*` (root CLAUDE.md rule).
 */
/**
 * Priority swatch colours for the custom dropdown, which paints an inline dot and
 * therefore needs a real colour value rather than a Tailwind class. Same hues as
 * PRIORITY_CLASS below so the pill and the dot agree.
 */
export const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "#be123c",
  HIGH: "#c2410c",
  MEDIUM: "#1d4ed8",
  LOW: "#4b5563",
  LOWEST: "#9ca3af",
};

export const PRIORITY_CLASS: Record<string, string> = {
  CRITICAL: "text-rose-700 bg-rose-50",
  HIGH: "text-orange-700 bg-orange-50",
  MEDIUM: "text-blue-700 bg-blue-50",
  LOW: "text-gray-600 bg-gray-100",
  LOWEST: "text-gray-500 bg-gray-50",
};

/** Approval pill styling, mirroring the reference UI's Approved/In review/Draft. */
export const APPROVAL_CLASS: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  IN_REVIEW: "bg-gray-200 text-gray-700",
  DRAFT: "bg-gray-100 text-gray-600",
  DEPRECATED: "bg-amber-100 text-amber-800",
};

const LABELS = new Map(
  [...PRIORITY_OPTIONS, ...TYPE_OPTIONS, ...AUTOMATION_OPTIONS, ...APPROVAL_OPTIONS].map(
    (o) => [o.value, o.label],
  ),
);

/** Human label for any enum value; falls back to the raw value. */
export function labelOf(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS.get(value) ?? value;
}

/** Display id for a case — the reference UI's `TC-1042`. */
export function caseRef(refId: number): string {
  return `TC-${refId}`;
}

export interface CaseLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface TestCaseRow {
  id: string;
  refId: number;
  title: string;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string | null;
  approvalState: string;
  currentVersion: number;
  ownerId: string | null;
  sectionId: string;
  updatedAt: string;
  /** QUIKTR-335 optional columns. */
  estimateMs: number | null;
  refTickets: string | null;
  labels: CaseLabel[];
}

/**
 * Columns the case list can show (QUIKTR-335).
 *
 * ID and Title are deliberately absent: they are structural (the row's identity
 * and its click target), so they are always rendered and cannot be switched off.
 * Everything here is optional and user-toggleable.
 */
export const CASE_COLUMNS = [
  { key: "priority", label: "Priority", default: true },
  { key: "type", label: "Type", default: true },
  { key: "automation", label: "Automation", default: true },
  { key: "approval", label: "Status", default: true },
  { key: "estimate", label: "Estimate", default: false },
  { key: "forecast", label: "Forecast", default: false },
  // On by default: labels are now authorable, and a label you just added should
  // be visible in the list without first hunting through the Columns menu.
  { key: "labels", label: "Labels", default: true },
  { key: "references", label: "References", default: false },
  { key: "updated", label: "Updated", default: false },
] as const;

export type CaseColumnKey = (typeof CASE_COLUMNS)[number]["key"];

export const DEFAULT_CASE_COLUMNS: CaseColumnKey[] = CASE_COLUMNS.filter(
  (c) => c.default,
).map((c) => c.key);

export interface SuiteNode {
  id: string;
  name: string;
  sections: SectionNode[];
}

export interface SectionNode {
  id: string;
  name: string;
  parentId: string | null;
  orderNo: number;
  caseCount?: number;
}
