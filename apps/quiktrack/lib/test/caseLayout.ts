/**
 * Which body a case template shows (QUIKTR-336 / 333).
 *
 * Extracted from the panels so the rule is stated once and testable. Both the
 * step-based and text-based expectations are stored on EVERY case; the template
 * decides which is authoritative. Getting this wrong doesn't throw — it hides a
 * case's procedure, which looks like data loss.
 */

export type TemplateKind = "TEXT" | "STEPS" | "BDD" | "EXPLORATORY";

/** Unknown/missing template falls back to STEPS, matching the seeded default. */
export function normaliseKind(kind: string | null | undefined): TemplateKind {
  return kind === "TEXT" || kind === "BDD" || kind === "EXPLORATORY"
    ? kind
    : "STEPS";
}

export interface CaseLayout {
  /** Show the numbered step list. */
  showSteps: boolean;
  /** Show the single case-level Expected Result. */
  showExpected: boolean;
}

/**
 * MUST match `case-body-fields.tsx`, which is the authoring surface and therefore
 * the authority: BDD prose is written into the case-level field (Given/When/Then
 * as text), NOT into the step grid, and EXPLORATORY has no formal expectation at
 * all — only a charter, kept in `preconditions`.
 *
 * A detail view that disagreed with the editor would show a body the author never
 * filled in while hiding the one they did.
 */
export function layoutFor(kind: string | null | undefined): CaseLayout {
  const k = normaliseKind(kind);
  return {
    showSteps: k === "STEPS",
    showExpected: k === "TEXT" || k === "BDD",
  };
}

/**
 * Content that exists but is hidden by the current template.
 *
 * Surfaced as a notice so preserved-but-invisible content never reads as
 * deleted — the single most confusing outcome of switching template.
 */
export function hiddenContentNotice(
  kind: string | null | undefined,
  opts: { stepCount: number; hasExpectedResult: boolean },
): "steps" | "expected" | null {
  const { showSteps, showExpected } = layoutFor(kind);
  if (!showSteps && opts.stepCount > 0) return "steps";
  if (!showExpected && opts.hasExpectedResult) return "expected";
  return null;
}
