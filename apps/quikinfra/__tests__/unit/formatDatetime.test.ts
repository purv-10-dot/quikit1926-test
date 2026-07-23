import { describe, it, expect } from "vitest";
import { formatDate, formatDateTimeIST } from "@/lib/format/datetime";

// Regression: the Audit Log "When" column used `toISOString()`, which always
// renders UTC — so IST users saw timestamps 5h30m behind. formatDateTimeIST
// must pin the Asia/Kolkata zone regardless of the render environment's TZ.
describe("formatDateTimeIST", () => {
  it("renders a UTC instant in IST (UTC + 5:30), not UTC", () => {
    // 2026-07-14T00:00:00Z → 2026-07-14 05:30:00 IST
    expect(formatDateTimeIST("2026-07-14T00:00:00Z")).toBe("14/07/2026, 05:30:00");
  });

  it("rolls to the next IST day when UTC is late evening", () => {
    // 2026-07-14T20:00:00Z → 2026-07-15 01:30:00 IST
    expect(formatDateTimeIST("2026-07-14T20:00:00Z")).toBe("15/07/2026, 01:30:00");
  });

  it("returns an em dash for empty/nullish input", () => {
    expect(formatDateTimeIST(null)).toBe("—");
    expect(formatDateTimeIST(undefined)).toBe("—");
    expect(formatDateTimeIST("")).toBe("—");
  });

  it("returns the raw string for an unparseable value", () => {
    expect(formatDateTimeIST("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDate", () => {
  it("reformats a yyyy-mm-dd string to dd-mm-yyyy without a TZ shift", () => {
    expect(formatDate("2026-07-14")).toBe("14-07-2026");
  });

  it("returns an em dash for empty input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});
