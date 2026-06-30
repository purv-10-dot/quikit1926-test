import { describe, it, expect } from "vitest";
import {
  createTimesheetSchema,
  updateTimesheetSchema,
  MIN_TIMESHEET_HOURS,
} from "@/lib/validation/timesheet";
import { parseClockToHours } from "@/lib/utils/timesheetPeriod";

const base = { issueId: "issue_1", entryDate: "2026-06-24T00:00:00.000Z" };

describe("timesheet hours floor", () => {
  // Regression: the floor was 0.25 h (15 min), which rejected short entries
  // like "00:10" on the Log time form. Sub-15-minute durations must validate.
  it("accepts a 10-minute entry (was blocked at the old 0.25h floor)", () => {
    const hours = parseClockToHours("00:10")!; // 0.1667h
    const res = createTimesheetSchema.safeParse({ ...base, hours });
    expect(res.success).toBe(true);
  });

  it("accepts the 1-minute minimum exactly (00:01)", () => {
    const hours = parseClockToHours("00:01")!; // 1/60 — matches MIN exactly
    expect(hours).toBe(MIN_TIMESHEET_HOURS);
    expect(createTimesheetSchema.safeParse({ ...base, hours }).success).toBe(true);
  });

  it("rejects zero with a human-readable message", () => {
    const res = createTimesheetSchema.safeParse({ ...base, hours: 0 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/at least 1 minute/);
    }
  });

  it("rejects more than 24 hours", () => {
    expect(createTimesheetSchema.safeParse({ ...base, hours: 24.5 }).success).toBe(false);
  });

  // The edit path shares the same floor (partial of the create schema).
  it("edit path applies the same sub-15-minute floor", () => {
    const hours = parseClockToHours("00:10")!;
    expect(updateTimesheetSchema.safeParse({ hours }).success).toBe(true);
  });
});
