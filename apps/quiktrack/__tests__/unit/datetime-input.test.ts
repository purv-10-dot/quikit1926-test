import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  localInputsToISO,
  toLocalDateInput,
  toLocalTimeInput,
} from "@/lib/utils/datetime-input";

// The sprint modals run in the viewer's zone. Pin it to IST so the assertions
// below describe the exact bug report: 4:40 PM IST -> stored 11:10Z.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Asia/Kolkata";
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("datetime-input helpers", () => {
  it("shows a stored UTC instant in local time, not UTC", () => {
    // Regression: edit modal used to slice the raw ISO string and render 11:10.
    const stored = "2026-08-17T11:10:00.000Z";
    expect(toLocalDateInput(stored)).toBe("2026-08-17");
    expect(toLocalTimeInput(stored)).toBe("16:40");
  });

  it("rolls the date back when UTC and local fall on different days", () => {
    const stored = "2026-08-17T20:00:00.000Z"; // 18 Aug 01:30 IST
    expect(toLocalDateInput(stored)).toBe("2026-08-18");
    expect(toLocalTimeInput(stored)).toBe("01:30");
  });

  it("round-trips: what the user picked is what they see on re-open", () => {
    const iso = localInputsToISO("2026-08-17", "16:40");
    expect(iso).toBe("2026-08-17T11:10:00.000Z");
    expect(toLocalDateInput(iso!)).toBe("2026-08-17");
    expect(toLocalTimeInput(iso!)).toBe("16:40");
  });

  it("defaults a missing time to 09:00 local", () => {
    expect(localInputsToISO("2026-08-17", "")).toBe("2026-08-17T03:30:00.000Z");
  });

  it("returns empty / undefined for missing or invalid values", () => {
    expect(toLocalDateInput(null)).toBe("");
    expect(toLocalTimeInput(null)).toBe("");
    expect(toLocalDateInput("not-a-date")).toBe("");
    expect(localInputsToISO("", "16:40")).toBeUndefined();
  });
});
