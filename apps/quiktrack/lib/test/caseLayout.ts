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
  // Mirrors the migration's seed EXACTLY — do not change these flags to alter what
  // the create form pre-selects. This list exists so a provisioned org is
  // indistinguishable from a seeded one; editing it would create drift between the
  // two without touching any org that already exists (ensureTestTemplates fills
  // gaps, it never updates).
  //
  // The create form's pre-selection is a UI concern and lives in
  // `lib/test/caseLayout.ts` → PREFERRED_NEW_CASE_KIND, applied by use-case-form.ts.
  { name: "Test Case (Steps)", kind: "STEPS", isDefault: true },
  { name: "Test Case (Text)", kind: "TEXT", isDefault: false },
  { name: "BDD / Gherkin", kind: "BDD", isDefault: false },
  { name: "Exploratory Session", kind: "EXPLORATORY", isDefault: false },
];

/**
 * Which template the CREATE form pre-selects.
 *
 * A UI default, deliberately separate from `QtTestTemplate.isDefault` in the database:
 * the owner wanted the form to open on "Test Case (Text)" without a data migration, and
 * every org already provisioned has STEPS flagged in the DB.
 *
 * Falls back gracefully — if an org has no TEXT template (a customised set), the form
 * uses the org's own default, then the first template, so it never opens with nothing
 * selected. See `use-case-form.ts`.
 */
export const PREFERRED_NEW_CASE_KIND: TemplateKind = "TEXT";

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
