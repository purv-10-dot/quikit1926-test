import { describe, expect, it } from "vitest";
import {
  hiddenContentNotice,
  layoutFor,
  normaliseKind,
} from "@/lib/test/caseLayout";

/**
 * QUIKTR-336 — which body a template authorises.
 *
 * This exists because the editor and the read-only detail panel MUST agree. When
 * I first wrote the panel I had BDD showing the step grid while the editor writes
 * BDD prose into the case-level field — that would have shown an empty body while
 * hiding the text the author actually wrote. One shared rule, asserted here.
 */

describe("normaliseKind", () => {
  it("passes through the four known kinds", () => {
    for (const k of ["TEXT", "STEPS", "BDD", "EXPLORATORY"]) {
      expect(normaliseKind(k)).toBe(k);
    }
  });

  it("falls back to STEPS for null, undefined and junk", () => {
    // A case with no template still has to render something, and STEPS is the
    // seeded default.
    expect(normaliseKind(null)).toBe("STEPS");
    expect(normaliseKind(undefined)).toBe("STEPS");
    expect(normaliseKind("GHERKIN")).toBe("STEPS");
    expect(normaliseKind("")).toBe("STEPS");
  });
});

describe("layoutFor", () => {
  it("STEPS shows the step grid only", () => {
    expect(layoutFor("STEPS")).toEqual({ showSteps: true, showExpected: false });
  });

  it("TEXT shows the case-level expectation only", () => {
    expect(layoutFor("TEXT")).toEqual({ showSteps: false, showExpected: true });
  });

  it("BDD writes prose into the case-level field, NOT the step grid", () => {
    // Matches case-body-fields.tsx, the authoring surface.
    expect(layoutFor("BDD")).toEqual({ showSteps: false, showExpected: true });
  });

  it("EXPLORATORY shows neither — it is a charter", () => {
    expect(layoutFor("EXPLORATORY")).toEqual({
      showSteps: false,
      showExpected: false,
    });
  });

  it("never shows both bodies at once", () => {
    for (const k of ["TEXT", "STEPS", "BDD", "EXPLORATORY", null, "junk"]) {
      const l = layoutFor(k);
      expect(l.showSteps && l.showExpected).toBe(false);
    }
  });
});

describe("hiddenContentNotice", () => {
  it("warns when steps exist but the template hides them", () => {
    expect(
      hiddenContentNotice("TEXT", { stepCount: 3, hasExpectedResult: false }),
    ).toBe("steps");
  });

  it("warns when an expected result exists but the template hides it", () => {
    expect(
      hiddenContentNotice("STEPS", { stepCount: 0, hasExpectedResult: true }),
    ).toBe("expected");
  });

  it("says nothing when the visible body is the populated one", () => {
    expect(
      hiddenContentNotice("STEPS", { stepCount: 2, hasExpectedResult: false }),
    ).toBeNull();
    expect(
      hiddenContentNotice("TEXT", { stepCount: 0, hasExpectedResult: true }),
    ).toBeNull();
  });

  it("says nothing when there is no content at all", () => {
    expect(
      hiddenContentNotice("EXPLORATORY", { stepCount: 0, hasExpectedResult: false }),
    ).toBeNull();
  });

  it("reports hidden steps on an EXPLORATORY case", () => {
    // Exploratory shows neither body, so BOTH kinds of content can be hidden.
    // Steps are reported first — they are the bigger surprise to lose sight of.
    expect(
      hiddenContentNotice("EXPLORATORY", { stepCount: 4, hasExpectedResult: true }),
    ).toBe("steps");
  });
});
