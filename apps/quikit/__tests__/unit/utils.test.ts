import { describe, it, expect, vi } from "vitest";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeDate,
  calculateProgress,
  generateInitials,
  slugify,
  truncateText,
  isValidEmail,
  getQuarterFromMonth,
  getMonthsForQuarter,
  getCurrentQuarter,
  getCurrentYear,
  getCurrentWeek,
  deepClone,
  hasOwnProperty,
  retry,
} from "@/lib/utils";

// ─── cn (class merge) ────────────────────────────────────────────────────────

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a Date object", () => {
    expect(formatDate(new Date(2025, 0, 15))).toBe("Jan 15, 2025");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2025-06-01")).toBe("Jun 1, 2025");
  });
});

// ─── formatDateTime ──────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("includes time component", () => {
    const result = formatDateTime(new Date(2025, 5, 15, 14, 30));
    expect(result).toBe("Jun 15, 2025 2:30 PM");
  });
});

// ─── formatRelativeDate ──────────────────────────────────────────────────────

describe("formatRelativeDate", () => {
  it("returns 'just now' for < 60 seconds", () => {
    const now = new Date();
    expect(formatRelativeDate(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeDate(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    expect(formatRelativeDate(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    expect(formatRelativeDate(threeDaysAgo)).toBe("3d ago");
  });

  it("falls back to formatted date for > 7 days", () => {
    const old = new Date(2024, 0, 1);
    expect(formatRelativeDate(old)).toBe("Jan 1, 2024");
  });
});

// ─── calculateProgress ──────────────────────────────────────────────────────

describe("calculateProgress", () => {
  it("calculates percentage", () => {
    expect(calculateProgress(50, 100)).toBe(50);
  });

  it("caps at 100", () => {
    expect(calculateProgress(200, 100)).toBe(100);
  });

  it("returns 0 for zero goal", () => {
    expect(calculateProgress(50, 0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    expect(calculateProgress(1, 3)).toBe(33);
  });
});

// ─── generateInitials ────────────────────────────────────────────────────────

describe("generateInitials", () => {
  it("returns uppercase initials", () => {
    expect(generateInitials("john", "doe")).toBe("JD");
  });

  it("handles empty strings", () => {
    expect(generateInitials("", "")).toBe("");
  });

  it("handles undefined-like values", () => {
    expect(generateInitials(undefined as unknown as string, "Doe")).toBe("D");
  });
});

// ─── slugify ─────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("converts to lowercase kebab-case", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("Hello! @World#")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify(" -Test- ")).toBe("test");
  });
});

// ─── truncateText ────────────────────────────────────────────────────────────

describe("truncateText", () => {
  it("returns original if shorter than limit", () => {
    expect(truncateText("hi", 10)).toBe("hi");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });
});

// ─── isValidEmail ────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test+tag@domain.co.uk")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@missing-local.com")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
  });
});

// ─── quarter helpers ─────────────────────────────────────────────────────────

describe("getQuarterFromMonth", () => {
  it.each([
    [1, "Q1"], [3, "Q1"],
    [4, "Q2"], [6, "Q2"],
    [7, "Q3"], [9, "Q3"],
    [10, "Q4"], [12, "Q4"],
  ])("month %i → %s", (month, expected) => {
    expect(getQuarterFromMonth(month)).toBe(expected);
  });
});

describe("getMonthsForQuarter", () => {
  it("returns correct months", () => {
    expect(getMonthsForQuarter("Q1")).toEqual([1, 2, 3]);
    expect(getMonthsForQuarter("Q2")).toEqual([4, 5, 6]);
    expect(getMonthsForQuarter("Q3")).toEqual([7, 8, 9]);
    expect(getMonthsForQuarter("Q4")).toEqual([10, 11, 12]);
  });

  it("returns empty for invalid quarter", () => {
    expect(getMonthsForQuarter("Q5")).toEqual([]);
  });
});

describe("getCurrentQuarter", () => {
  it("returns a valid quarter string", () => {
    expect(["Q1", "Q2", "Q3", "Q4"]).toContain(getCurrentQuarter());
  });
});

describe("getCurrentYear", () => {
  it("returns current year", () => {
    expect(getCurrentYear()).toBe(new Date().getFullYear());
  });
});

describe("getCurrentWeek", () => {
  it("returns a number between 1 and 53", () => {
    const week = getCurrentWeek();
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
  });
});

// ─── deepClone ───────────────────────────────────────────────────────────────

describe("deepClone", () => {
  it("produces an independent copy", () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    clone.b.c = 99;
    expect(original.b.c).toBe(2);
  });
});

// ─── hasOwnProperty ─────────────────────────────────────────────────────────

describe("hasOwnProperty", () => {
  it("detects own properties", () => {
    expect(hasOwnProperty({ x: 1 }, "x")).toBe(true);
  });

  it("rejects inherited properties", () => {
    expect(hasOwnProperty({}, "toString")).toBe(false);
  });
});

// ─── retry ───────────────────────────────────────────────────────────────────

describe("retry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    expect(await retry(fn, { delayMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(retry(fn, { maxAttempts: 2, delayMs: 1 })).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
