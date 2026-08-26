"use client";

import { Field, Textarea } from "@quikit/ui";
import { layoutFor, type TemplateKind } from "@/lib/test/caseLayout";
import { StepsEditor, type StepDraft } from "./steps-editor";

/**
 * The case body, laid out per the chosen TEMPLATE (QUIKTR-333).
 *
 * TestRail has two authoring styles and the spec's Template dropdown exists
 * precisely to pick between them:
 *   TEXT        → one Expected Result for the whole case
 *   STEPS       → per-step action ↔ expected pairs
 *   BDD         → Given/When/Then prose, no step grid
 *   EXPLORATORY → a charter, no formal expectations at all
 *
 * Both storage shapes live on every case, so this component only decides what to
 * SHOW. Switching template never deletes what was already authored — which is
 * why a case that has both keeps both, and the notice below says so rather than
 * letting content look lost.
 */

/** Re-exported so existing importers keep working; defined in lib/test/caseLayout.ts. */
export type { TemplateKind } from "@/lib/test/caseLayout";

const BDD_PLACEHOLDER = `Given a registered user with a verified email
When they submit valid credentials
Then they land on the dashboard`;

export function CaseBodyFields({
  kind,
  preconditions,
  onPreconditions,
  expectedResult,
  onExpectedResult,
  steps,
  onSteps,
  disabled,
}: {
  kind: TemplateKind;
  preconditions: string;
  onPreconditions: (v: string) => void;
  expectedResult: string;
  onExpectedResult: (v: string) => void;
  steps: StepDraft[];
  onSteps: (s: StepDraft[]) => void;
  disabled?: boolean;
}) {
  // Shared with the read-only detail panel (lib/test/caseLayout.ts) so the two
  // surfaces cannot disagree about which body a template authorises.
  const { showSteps, showExpected } = layoutFor(kind);
  const isExploratory = kind === "EXPLORATORY";

  // Content authored under a different template is kept, not deleted — say so,
  // otherwise it looks like switching template destroyed the work.
  const hiddenSteps = !showSteps && steps.some((s) => s.action.trim());
  const hiddenExpected = !showExpected && expectedResult.trim().length > 0;

  return (
    <div className="space-y-4">
      <Field
        label={isExploratory ? "Charter" : "Preconditions"}
        hint={
          isExploratory
            ? "What area to explore and what you are looking for."
            : undefined
        }
      >
        <Textarea
          rows={isExploratory ? 4 : 2}
          value={preconditions}
          disabled={disabled}
          placeholder={
            isExploratory
              ? "Explore checkout with an expired card. Look for unclear error states."
              : "A registered user exists with a verified email address."
          }
          onChange={(e) => onPreconditions(e.target.value)}
        />
      </Field>

      {showSteps && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Steps</p>
          <StepsEditor steps={steps} onChange={onSteps} disabled={disabled} />
        </div>
      )}

      {showExpected && (
        <Field
          label={kind === "BDD" ? "Scenario" : "Expected Result"}
          hint={
            kind === "BDD"
              ? "Given / When / Then."
              : "The observable outcome that decides pass or fail."
          }
        >
          <Textarea
            rows={kind === "BDD" ? 6 : 4}
            value={expectedResult}
            disabled={disabled}
            placeholder={
              kind === "BDD"
                ? BDD_PLACEHOLDER
                : "User is redirected to the dashboard and is logged in."
            }
            onChange={(e) => onExpectedResult(e.target.value)}
          />
        </Field>
      )}

      {isExploratory && (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          An exploratory session has no fixed steps or expected result — the
          tester records what they found as the result comment.
        </p>
      )}

      {(hiddenSteps || hiddenExpected) && (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          This case also has{" "}
          {hiddenSteps && hiddenExpected
            ? "steps and an expected result"
            : hiddenSteps
              ? `${steps.filter((s) => s.action.trim()).length} step(s)`
              : "an expected result"}{" "}
          authored under a different template. It is kept, just not shown by this
          one — switch the template back to see it.
        </p>
      )}
    </div>
  );
}
