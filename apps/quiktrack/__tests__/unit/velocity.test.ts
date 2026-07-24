import { describe, it, expect } from "vitest";
import {
  isVelocityScopedType,
  computeSprintVelocity,
  type VelocityIssue,
} from "@/lib/reports/velocity";

const issue = (over: Partial<VelocityIssue> & { id: string }): VelocityIssue => ({
  type: "TASK",
  storyPoints: 0,
  eta: 0,
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

describe("computeSprintVelocity", () => {
  it("sums committed points/hours over scoped types and completed over DONE ones", () => {
    const m = computeSprintVelocity([
      issue({ id: "a", type: "TASK", storyPoints: 5, eta: 8, statusCategory: "DONE" }),
      issue({ id: "b", type: "STORY", storyPoints: 3, eta: 4, statusCategory: "IN_PROGRESS" }),
      issue({ id: "c", type: "BUG", storyPoints: 8, eta: 10, statusCategory: "DONE" }), // excluded
      issue({ id: "d", type: "EPIC", storyPoints: 13, eta: 20, statusCategory: "DONE" }), // excluded
      issue({ id: "e", type: "SUBTASK", storyPoints: 2, eta: 2, statusCategory: "DONE" }), // excluded
    ]);
    // scoped = a,b → committed pts 8, hours 12. completed = a → 5 pts, 8 h.
    expect(m.committedPoints).toBe(8);
    expect(m.completedPoints).toBe(5);
    expect(m.committedHours).toBe(12);
    expect(m.completedHours).toBe(8);
    expect(m.committedCount).toBe(2);
    expect(m.completedCount).toBe(1);
    expect(m.completionPct).toBe(Math.round((5 / 8) * 100)); // 63
    expect(m.committedIssueIds).toEqual(["a", "b"]);
  });

  it("treats null points/eta as 0", () => {
    const m = computeSprintVelocity([
      issue({ id: "a", type: "TASK", storyPoints: null, eta: null, statusCategory: "DONE" }),
      issue({ id: "b", type: "TASK", storyPoints: 4, eta: 6, statusCategory: "DONE" }),
    ]);
    expect(m.committedPoints).toBe(4);
    expect(m.committedHours).toBe(6);
    expect(m.completedPoints).toBe(4);
    expect(m.completionPct).toBe(100);
  });

  it("completionPct is 0 when nothing is committed", () => {
    const m = computeSprintVelocity([
      issue({ id: "x", type: "EPIC", storyPoints: 5, statusCategory: "DONE" }),
    ]);
    expect(m.committedPoints).toBe(0);
    expect(m.completedPoints).toBe(0);
    expect(m.completionPct).toBe(0);
    expect(m.committedIssueIds).toEqual([]);
  });

  it("empty sprint → all zeros", () => {
    expect(computeSprintVelocity([])).toEqual({
      committedPoints: 0,
      completedPoints: 0,
      committedHours: 0,
      completedHours: 0,
      committedCount: 0,
      completedCount: 0,
      completionPct: 0,
      committedIssueIds: [],
    });
  });
});
