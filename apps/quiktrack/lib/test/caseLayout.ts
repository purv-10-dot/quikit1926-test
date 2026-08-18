/**
 * Which body a case template shows (QUIKTR-336 / 333).
 *
 * Extracted from the panels so the rule is stated once and testable. Both the
 * step-based and text-based expectations are stored on EVERY case; the template
 * decides which is authoritative. Getting this wrong doesn't throw — it hides a
 * case's procedure, which looks like data loss.
 */

export type TemplateKind = "TEXT" | "STEPS" | "BDD" | "EXPLORATORY";

/**
 * The four org-wide templates every org must have, and the ONLY definition of them.
 *
 * Mirrors the seed in `20260807140000_quiktest_testrail_parity/migration.sql`
 * exactly. Kept here because that seed was a `CROSS JOIN quikit."Org"` — a one-shot
 * over orgs existing when the migration ran — so any org created afterwards had NO
 * templates and the case editor's Template dropdown showed "No options". That
 * degrades quietly rather than erroring: `useCaseForm` falls back to STEPS, so every
 * case is implicitly step-based and the TEXT / BDD / Exploratory layouts are
 * unreachable.
 *
 * `ensureTestTemplates()` provisions from this list. Same failure class as the test
 * statuses — see `lib/services/testStatusProvisioning.ts`.
 */
export interface TestTemplateSeed {
  name: string;
  kind: TemplateKind;
  isDefault: boolean;
}

export const TEST_TEMPLATE_SEED: readonly TestTemplateSeed[] = [
  // STEPS is the default because it is what every case authored so far uses —
  // making TEXT the default would change how existing cases render.
  { name: "Test Case (Steps)", kind: "STEPS", isDefault: true },
  { name: "Test Case (Text)", kind: "TEXT", isDefault: false },
  { name: "BDD / Gherkin", kind: "BDD", isDefault: false },
  { name: "Exploratory Session", kind: "EXPLORATORY", isDefault: false },
];

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
