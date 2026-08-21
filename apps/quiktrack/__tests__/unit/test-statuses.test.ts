import { describe, expect, it } from "vitest";
import {
  TEST_STATUSES,
  donutSegments,
  executedTests,
  failedTests,
  passRate,
  passedTests,
  statusMeta,
  totalTests,
  untestedRate,
  type StatusCounts,
} from "@/lib/test/statuses";

/**
 * QuikTest status catalogue + result maths.
 *
 * The pass-rate rule under test is the plan's §4 decision: the rate is a
 * percentage of EXECUTED tests, with untested reported separately — matching
 * the reference UI's `0% Passed · 18 / 18 untested (100%)`.
 */

describe("status catalogue", () => {
  it("has exactly one default status", () => {
    expect(TEST_STATUSES.filter((s) => s.isDefault).map((s) => s.key)).toEqual([
      "untested",
    ]);
  });

  it("splits three automation statuses from the manual ones", () => {
    expect(TEST_STATUSES.filter((s) => s.isAutomation)).toHaveLength(3);
  });

  it("throws on an unknown status key", () => {
    // @ts-expect-error — guarding the runtime branch, not the type
    expect(() => statusMeta("nope")).toThrow(/Unknown test status/);
  });
});

describe("an all-untested run (the reference screenshot)", () => {
  const counts: StatusCounts = { untested: 18 };

  it("counts 18 total and 0 executed", () => {
    expect(totalTests(counts)).toBe(18);
    expect(executedTests(counts)).toBe(0);
  });

  it("reports 0% rather than NaN", () => {
    expect(passRate(counts)).toBe(0);
  });

  it("reports untested as 100% of the run", () => {
    expect(untestedRate(counts)).toBe(100);
  });

  it("still renders one full donut ring", () => {
    expect(donutSegments(counts)).toEqual([
      expect.objectContaining({ key: "untested", from: 0, to: 100 }),
    ]);
  });
});

describe("pass rate", () => {
  it("excludes untested from the denominator", () => {
    // 8 of 10 executed = 80%. Including the 10 untested would give 40%.
    expect(passRate({ passed: 8, failed: 2, untested: 10 })).toBe(80);
  });

  it("folds automation results into the headline numbers", () => {
    const counts: StatusCounts = {
      passed: 2,
      automation_passed: 6,
      failed: 1,
      automation_failed: 2,
      automation_error: 1,
    };
    expect(passedTests(counts)).toBe(8);
    expect(failedTests(counts)).toBe(4);
    expect(passRate(counts)).toBe(67);
  });

  it("treats retest as executed — it has a result behind it", () => {
    expect(executedTests({ retest: 4, untested: 6 })).toBe(4);
    expect(passRate({ retest: 4, untested: 6 })).toBe(0);
  });

  it("reports 100% when everything passed", () => {
    expect(passRate({ passed: 5 })).toBe(100);
  });

  it("returns zeros for empty counts instead of NaN", () => {
    expect(totalTests({})).toBe(0);
    expect(executedTests({})).toBe(0);
    expect(passRate({})).toBe(0);
    expect(untestedRate({})).toBe(0);
  });
});

describe("donut segments", () => {
  it("skips zero-count statuses", () => {
    expect(
      donutSegments({ passed: 1, failed: 0, untested: 1 }).map((s) => s.key),
    ).toEqual(["passed", "untested"]);
  });

  it("spans exactly 0..100", () => {
    const segments = donutSegments({ passed: 1, failed: 1, blocked: 1 });
    expect(segments[0].from).toBe(0);
    expect(segments[segments.length - 1].to).toBeCloseTo(100, 9);
  });

  it("orders manual (including retest), then automation, then untested", () => {
    const segments = donutSegments({
      untested: 1,
      automation_passed: 1,
      passed: 1,
      retest: 1,
      failed: 1,
    });
    expect(segments.map((s) => s.key)).toEqual([
      "passed",
      "failed",
      "retest",
      "automation_passed",
      "untested",
    ]);
  });

  it("renders a single ring for an empty run", () => {
    expect(donutSegments({})).toHaveLength(1);
  });
});
