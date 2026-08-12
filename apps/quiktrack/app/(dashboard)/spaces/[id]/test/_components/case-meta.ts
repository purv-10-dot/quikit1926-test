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
}

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
