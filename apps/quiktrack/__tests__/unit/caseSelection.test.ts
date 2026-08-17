import { describe, expect, it } from "vitest";
import {
  applyTick,
  descendantCaseIds,
  groupCases,
  groupSections,
  tickState,
} from "@/lib/test/caseSelection";

/**
 * QUIKTR-337 — folder/case selection maths for the "Include Test Cases" picker.
 *
 * These are pure functions on purpose: a mistake here does not throw, it builds
 * a run over the wrong case set.
 */

// root
//  ├── ui        (TC-1, TC-2)
//  │    └── auth (TC-3)
//  └── empty     (no cases)
const SECTIONS = [
  { id: "root", parentId: null },
  { id: "ui", parentId: "root" },
  { id: "auth", parentId: "ui" },
  { id: "empty", parentId: "root" },
];
const CASES = [
  { id: "c1", sectionId: "ui" },
  { id: "c2", sectionId: "ui" },
  { id: "c3", sectionId: "auth" },
];

const byParent = groupSections(SECTIONS);
const bySection = groupCases(CASES);

describe("descendantCaseIds", () => {
  it("includes cases in nested folders", () => {
    expect(descendantCaseIds("ui", byParent, bySection).sort()).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("collects the whole tree from the root", () => {
    expect(descendantCaseIds("root", byParent, bySection).sort()).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("returns nothing for a folder with no cases", () => {
    expect(descendantCaseIds("empty", byParent, bySection)).toEqual([]);
  });

  it("returns only its own case for a leaf", () => {
    expect(descendantCaseIds("auth", byParent, bySection)).toEqual(["c3"]);
  });

  it("terminates on a cycle instead of hanging", () => {
    // parentId is user-editable, so corrupt data must not lock the UI.
    const cyclic = groupSections([
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]);
    const cases = groupCases([
      { id: "x", sectionId: "a" },
      { id: "y", sectionId: "b" },
    ]);
    const out = descendantCaseIds("a", cyclic, cases);
    expect(out.sort()).toEqual(["x", "y"]);
    // Each case exactly once, despite the loop.
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("tickState", () => {
  it("is none when nothing is selected", () => {
    expect(tickState(["c1", "c2"], new Set())).toBe("none");
  });

  it("is some when partially selected", () => {
    expect(tickState(["c1", "c2"], new Set(["c1"]))).toBe("some");
  });

  it("is all when fully selected", () => {
    expect(tickState(["c1", "c2"], new Set(["c1", "c2"]))).toBe("all");
  });

  it("is none — NOT all — for an empty folder", () => {
    // `picked === total` is trivially true at 0; an empty folder rendering as
    // fully ticked is the bug this guards.
    expect(tickState([], new Set())).toBe("none");
  });

  it("ignores selected ids outside the folder", () => {
    expect(tickState(["c1"], new Set(["c1", "elsewhere"]))).toBe("all");
  });
});

describe("applyTick", () => {
  it("adds ids without mutating the input set", () => {
    const before = new Set(["c1"]);
    const after = applyTick(before, ["c2", "c3"], true);
    expect([...after].sort()).toEqual(["c1", "c2", "c3"]);
    expect([...before]).toEqual(["c1"]);
  });

  it("removes ids", () => {
    expect([...applyTick(new Set(["c1", "c2"]), ["c1"], false)]).toEqual(["c2"]);
  });

  it("is idempotent", () => {
    const once = applyTick(new Set(), ["c1"], true);
    expect([...applyTick(once, ["c1"], true)]).toEqual(["c1"]);
  });

  it("untickng a folder clears its nested cases too", () => {
    const all = descendantCaseIds("ui", byParent, bySection);
    const selected = applyTick(new Set(), all, true);
    expect(selected.size).toBe(3);
    expect(applyTick(selected, all, false).size).toBe(0);
  });
});
