import { describe, it, expect } from "vitest";
import { rollUpEta, rollUpStartDate, rollUpDueDate } from "@/components/edit-issue-modal";

describe("rollUpEta", () => {
  it("returns null when there are no subtasks", () => {
    expect(rollUpEta([])).toBeNull();
  });

  it("returns null when no subtask has a positive eta", () => {
    expect(rollUpEta([{ eta: null }, { eta: 0 }, {}])).toBeNull();
  });

  it("sums positive subtask etas", () => {
    expect(rollUpEta([{ eta: 1 }, { eta: 2 }, { eta: 0.5 }])).toBe(3.5);
  });

  it("ignores negative / null / undefined etas", () => {
    expect(
      rollUpEta([{ eta: 2 }, { eta: -1 }, { eta: null }, { eta: undefined }, { eta: 0.5 }]),
    ).toBe(2.5);
  });
});

describe("rollUpStartDate", () => {
  it("returns null when no subtask has a start date", () => {
    expect(rollUpStartDate([])).toBeNull();
    expect(rollUpStartDate([{ startDate: null }, {}])).toBeNull();
  });

  it("returns the earliest start date as ISO", () => {
    const a = "2026-05-10T00:00:00.000Z";
    const b = "2026-04-01T00:00:00.000Z";
    const c = "2026-06-15T00:00:00.000Z";
    const out = rollUpStartDate([{ startDate: a }, { startDate: b }, { startDate: c }]);
    expect(out).toBe(b);
  });

  it("ignores invalid date strings", () => {
    const valid = "2026-04-01T00:00:00.000Z";
    expect(
      rollUpStartDate([{ startDate: "not-a-date" }, { startDate: valid }]),
    ).toBe(valid);
  });
});

describe("rollUpDueDate", () => {
  it("returns null when no subtask has a due date", () => {
    expect(rollUpDueDate([])).toBeNull();
    expect(rollUpDueDate([{ dueDate: null }, {}])).toBeNull();
  });

  it("returns the latest due date as ISO", () => {
    const a = "2026-05-10T00:00:00.000Z";
    const b = "2026-04-01T00:00:00.000Z";
    const c = "2026-06-15T00:00:00.000Z";
    const out = rollUpDueDate([{ dueDate: a }, { dueDate: b }, { dueDate: c }]);
    expect(out).toBe(c);
  });
});
