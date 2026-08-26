import type { TemplateKind } from "./caseLayout";

/**
 * Which body layout an imported row is authored in.
 *
 * Split from `importMap.ts`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once template support landed.
 *
 * Why this exists at all: the importer never set `templateId`, so every imported case
 * fell back to the STEPS layout. A case carrying only an Expected Result therefore
 * rendered an empty step list with its text invisible — stored, but unreachable.
 */

/**
 * Template names and aliases a spreadsheet might use.
 *
 * Deliberately generous: people export from TestRail, Zephyr and hand-built Excel, so
 * "Text", "Test Case (Text)" and "text" must all reach TEXT rather than being rejected
 * over spelling. Keys are normalised by stripping spaces, underscores, hyphens,
 * slashes and brackets.
 */
const TEMPLATE_ALIASES: Record<string, TemplateKind> = {
  text: "TEXT",
  testcasetext: "TEXT",
  plaintext: "TEXT",
  steps: "STEPS",
  testcasesteps: "STEPS",
  stepbystep: "STEPS",
  bdd: "BDD",
  gherkin: "BDD",
  bddgherkin: "BDD",
  cucumber: "BDD",
  exploratory: "EXPLORATORY",
  exploratorysession: "EXPLORATORY",
  charter: "EXPLORATORY",
};

/** Parses an explicit Template cell. Null when empty or unrecognised. */
export function parseTemplateKind(cell: string): TemplateKind | null {
  const key = cell.toLowerCase().replace(/[\s_()/-]+/g, "");
  return TEMPLATE_ALIASES[key] ?? null;
}

/**
 * Infers the layout from what the row actually contains, when no Template column is
 * given — which is what most spreadsheets will rely on.
 *
 * Steps win over a case-level expectation when BOTH are present: per-step expectations
 * are the more specific authoring, and STEPS is the only layout that shows them. The
 * case-level text is still stored and reappears if the template is switched.
 */
export function inferTemplateKind(row: {
  steps: unknown[];
  expectedResult: string | null;
  preconditions: string | null;
}): TemplateKind {
  if (row.steps.length > 0) return "STEPS";
  if (row.expectedResult) return "TEXT";
  // No steps and no expectation, but a charter-like precondition — the Exploratory
  // shape. Otherwise TEXT, which shows an (empty) expectation field rather than an
  // empty grid.
  if (row.preconditions) return "EXPLORATORY";
  return "TEXT";
}

/**
 * Content the chosen layout will not DISPLAY, so the import can say so.
 *
 * Only reports steps hidden by a text-style layout. It deliberately does NOT report a
 * case-level Expected Result alongside steps: writing steps and an overall expected
 * outcome is completely normal authoring, most real spreadsheets do it, and warning
 * would fire on nearly every row — which trains people to ignore warnings.
 */
export function hiddenByLayout(
  kind: TemplateKind,
  stepCount: number,
): string | null {
  if (kind !== "STEPS" && stepCount > 0) {
    return (
      `${stepCount} step${stepCount === 1 ? "" : "s"} imported but hidden by the ` +
      `${kind} layout. They are kept and reappear if the template is switched to Steps.`
    );
  }
  return null;
}
