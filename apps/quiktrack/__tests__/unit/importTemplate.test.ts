import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/test/importParse";
import { mapRows, SAMPLE_CSV } from "@/lib/test/importMap";
import {
  hiddenByLayout,
  inferTemplateKind,
  parseTemplateKind,
} from "@/lib/test/importTemplate";

/**
 * Import must support all four case templates.
 *
 * The bug this fixes was SILENT: the importer never set `templateId`, so every imported
 * case fell back to the STEPS layout. A case carrying only an Expected Result therefore
 * rendered an empty step list with its text invisible — stored, but unreachable.
 */

const map = (csv: string) => {
  const parsed = parseCsv(csv);
  return mapRows(parsed.rows, parsed.headers);
};

describe("parseTemplateKind", () => {
  it("accepts the names people actually type", () => {
    // Exports come from TestRail, Zephyr and hand-built Excel, so spelling varies.
    expect(parseTemplateKind("Text")).toBe("TEXT");
    expect(parseTemplateKind("Test Case (Text)")).toBe("TEXT");
    expect(parseTemplateKind("steps")).toBe("STEPS");
    expect(parseTemplateKind("Gherkin")).toBe("BDD");
    expect(parseTemplateKind("Cucumber")).toBe("BDD");
    expect(parseTemplateKind("Exploratory Session")).toBe("EXPLORATORY");
  });

  it("returns null for empty or unknown values so they can be inferred", () => {
    expect(parseTemplateKind("")).toBeNull();
    expect(parseTemplateKind("Nonsense")).toBeNull();
  });
});

describe("inferTemplateKind", () => {
  it("chooses STEPS when the row has steps", () => {
    expect(
      inferTemplateKind({ steps: [{}], expectedResult: null, preconditions: null }),
    ).toBe("STEPS");
  });

  it("chooses TEXT for an expectation with no steps — the reported bug", () => {
    // This case used to render an empty step grid with its text hidden.
    expect(
      inferTemplateKind({ steps: [], expectedResult: "It works", preconditions: null }),
    ).toBe("TEXT");
  });

  it("prefers STEPS when both are present", () => {
    // Per-step expectations are the more specific authoring, and only STEPS shows them.
    expect(
      inferTemplateKind({ steps: [{}], expectedResult: "x", preconditions: null }),
    ).toBe("STEPS");
  });

  it("chooses EXPLORATORY for a charter with no steps or expectation", () => {
    expect(
      inferTemplateKind({ steps: [], expectedResult: null, preconditions: "Time-box 45m" }),
    ).toBe("EXPLORATORY");
  });

  it("falls back to TEXT rather than an empty step grid", () => {
    expect(
      inferTemplateKind({ steps: [], expectedResult: null, preconditions: null }),
    ).toBe("TEXT");
  });
});

describe("hiddenByLayout", () => {
  it("warns when a text-style layout hides steps", () => {
    expect(hiddenByLayout("TEXT", 2)).toMatch(/hidden/);
  });

  it("stays silent when the layout matches the content", () => {
    expect(hiddenByLayout("STEPS", 2)).toBeNull();
    expect(hiddenByLayout("TEXT", 0)).toBeNull();
  });

  it("does NOT warn about an expectation alongside steps", () => {
    // Steps plus an overall expected outcome is normal authoring. Warning there would
    // fire on nearly every real row and train people to ignore warnings — this
    // function takes only the step count, so it cannot.
    expect(hiddenByLayout("STEPS", 3)).toBeNull();
  });
});

describe("import end to end", () => {
  it("honours an explicit Template column", () => {
    const r = map(`Title,Template,Expected Result\nX,Gherkin,"Given a\nWhen b"`);
    expect(r.cases[0].templateKind).toBe("BDD");
  });

  it("infers the layout when no Template column is given", () => {
    expect(map(`Title,Expected Result\nX,Only text`).cases[0].templateKind).toBe("TEXT");
  });

  it("warns but still imports a row with an unrecognised Template", () => {
    const r = map(`Title,Template,Steps\nX,Nonsense,1. do it`);
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].templateKind).toBe("STEPS");
    expect(r.issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("keeps content the chosen layout hides, and says so", () => {
    const r = map(`Title,Template,Steps\nX,Text,"1. one\n2. two"`);
    expect(r.cases[0].steps).toHaveLength(2);
    expect(r.issues.some((i) => /hidden/.test(i.message))).toBe(true);
  });
});

describe("SAMPLE_CSV", () => {
  it("demonstrates every layout", () => {
    const kinds = [...new Set(map(SAMPLE_CSV).cases.map((c) => c.templateKind))].sort();
    expect(kinds).toEqual(["BDD", "EXPLORATORY", "STEPS", "TEXT"]);
  });

  it("imports with no errors and no hidden-content noise", () => {
    const r = map(SAMPLE_CSV);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(r.issues.filter((i) => /hidden/.test(i.message))).toHaveLength(0);
    expect(r.unknownHeaders).toEqual([]);
  });

  it("infers STEPS for the row that omits Template", () => {
    expect(map(SAMPLE_CSV).cases[0].templateKind).toBe("STEPS");
  });
});
