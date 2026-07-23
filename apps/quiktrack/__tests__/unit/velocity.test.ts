import { describe, it, expect } from "vitest";
import {
  isVelocityScopedType,
  computeCommittedScope,
  computeCompleted,
  type VelocityIssue,
} from "@/lib/reports/velocity";

const issue = (over: Partial<VelocityIssue> & { id: string }): VelocityIssue => ({
  type: "TASK",
  storyPoints: 0,
  statusCategory: "TODO",
  ...over,
});

describe("isVelocityScopedType", () => {
  it("counts TASK and STORY", () => {
    expect(isVelocityScopedType("TASK")).toBe(true);
    expect(isVelocityScopedType("STORY")).toBe(true);
  });
  it("excludes EPIC, SUBTASK and BUG (case-insensitive)", () => {
    for (const t of ["EPIC", "SUBTASK", "BUG", "bug", "SubTask"]) {
      expect(isVelocityScopedType(t)).toBe(false);
    }
  });
});

describe("computeCommittedScope", () => {
  it("sums storyPoints of scoped types and freezes their ids", () => {
    const scope = computeCommittedScope([
      issue({ id: "a", type: "TASK", storyPoints: 5 }),
      issue({ id: "b", type: "STORY", storyPoints: 3 }),
      issue({ id: "c", type: "BUG", storyPoints: 8 }), // excluded
      issue({ id: "d", type: "EPIC", storyPoints: 13 }), // excluded
      issue({ id: "e", type: "SUBTASK", storyPoints: 2 }), // excluded
    ]);
    expect(scope.committedPoints).toBe(8);
    expect(scope.committedCount).toBe(2);
    expect(scope.committedIssueIds).toEqual(["a", "b"]);
  });

  it("treats null storyPoints as 0", () => {
    const scope = computeCommittedScope([
      issue({ id: "a", type: "TASK", storyPoints: null }),
      issue({ id: "b", type: "TASK", storyPoints: 4 }),
    ]);
    expect(scope.committedPoints).toBe(4);
    expect(scope.committedCount).toBe(2);
  });

  it("returns an empty scope for no issues", () => {
    expect(computeCommittedScope([])).toEqual({
      committedPoints: 0,
      committedCount: 0,
      committedIssueIds: [],
    });
  });
});

describe("computeCompleted", () => {
  const committedIds = ["a", "b", "c"];

  it("counts only committed issues that ended DONE", () => {
    const result = computeCompleted(committedIds, [
      issue({ id: "a", storyPoints: 5, statusCategory: "DONE" }),
      issue({ id: "b", storyPoints: 3, statusCategory: "IN_PROGRESS" }),
      issue({ id: "c", storyPoints: 2, statusCategory: "DONE" }),
    ]);
    expect(result.completedPoints).toBe(7);
    expect(result.completedCount).toBe(2);
  });

  it("ignores DONE issues that were never in the committed set", () => {
    const result = computeCompleted(committedIds, [
      issue({ id: "a", storyPoints: 5, statusCategory: "DONE" }),
      issue({ id: "x", storyPoints: 99, statusCategory: "DONE" }), // added mid-sprint
    ]);
    expect(result.completedPoints).toBe(5);
    expect(result.completedCount).toBe(1);
  });

  it("returns zero when nothing is done", () => {
    const result = computeCompleted(committedIds, [
      issue({ id: "a", statusCategory: "TODO" }),
    ]);
    expect(result).toEqual({ completedPoints: 0, completedCount: 0 });
  });
});
