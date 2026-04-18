import { describe, it, expect } from "vitest";
import {
  emptyArr3,
  emptyArr5,
  emptyCrit,
  emptyTarget,
  emptyGoal,
  emptyThrust,
  emptyKeyInitiatives,
  emptyRocks,
  emptyAction,
  emptyKPI,
  emptyQP,
  parseUrlYear,
  parseUrlQuarter,
  formatDueDate,
  stripHtml,
  resolveOwnerName,
} from "@/lib/utils/opspHelpers";

describe("empty-state factories", () => {
  it("emptyArr3 returns 3 empty strings", () => {
    expect(emptyArr3()).toEqual(["", "", ""]);
  });

  it("emptyArr5 returns 5 empty strings", () => {
    expect(emptyArr5()).toEqual(["", "", "", "", ""]);
  });

  it("emptyArr3 returns a fresh array on each call (no aliasing)", () => {
    const a = emptyArr3();
    const b = emptyArr3();
    a[0] = "mutated";
    expect(b[0]).toBe("");
  });

  it("emptyCrit returns a card with empty title and 4 empty bullets", () => {
    const crit = emptyCrit();
    expect(crit.title).toBe("");
    expect(crit.bullets).toEqual(["", "", "", ""]);
  });

  it("emptyCrit is not shared between calls", () => {
    const a = emptyCrit();
    const b = emptyCrit();
    a.bullets[0] = "mutated";
    expect(b.bullets[0]).toBe("");
  });

  it("emptyTarget returns 5 rows with all fields empty", () => {
    const rows = emptyTarget();
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r).toEqual({
        category: "",
        projected: "",
        y1: "",
        y2: "",
        y3: "",
        y4: "",
        y5: "",
      });
    }
  });

  it("emptyGoal returns 6 rows (one more than targets for balancing)", () => {
    const rows = emptyGoal();
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      category: "",
      projected: "",
      q1: "",
      q2: "",
      q3: "",
      q4: "",
    });
  });

  it("emptyThrust returns 5 empty desc/owner rows", () => {
    const rows = emptyThrust();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.desc === "" && r.owner === "")).toBe(true);
  });

  it("emptyKeyInitiatives returns 5 empty desc/owner rows", () => {
    const rows = emptyKeyInitiatives();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.desc === "" && r.owner === "")).toBe(true);
  });

  it("emptyRocks returns 5 empty desc/owner rows", () => {
    const rows = emptyRocks();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.desc === "" && r.owner === "")).toBe(true);
  });

  it("emptyAction returns 6 rows with category/projected/m1/m2/m3", () => {
    const rows = emptyAction();
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r).toEqual({
        category: "",
        projected: "",
        m1: "",
        m2: "",
        m3: "",
      });
    }
  });

  it("emptyKPI returns 5 empty kpi/goal rows", () => {
    const rows = emptyKPI();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.kpi === "" && r.goal === "")).toBe(true);
  });

  it("emptyQP returns 5 empty priority/dueDate rows", () => {
    const rows = emptyQP();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.priority === "" && r.dueDate === "")).toBe(true);
  });
});

describe("parseUrlYear", () => {
  it("returns null for null", () => {
    expect(parseUrlYear(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(parseUrlYear(undefined)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(parseUrlYear("")).toBe(null);
  });

  it("returns null for a non-numeric string", () => {
    expect(parseUrlYear("abc")).toBe(null);
  });

  it("returns null for 0", () => {
    expect(parseUrlYear("0")).toBe(null);
  });

  it("returns null for a negative year", () => {
    expect(parseUrlYear("-2025")).toBe(null);
  });

  it("returns a valid year when the string is numeric", () => {
    expect(parseUrlYear("2026")).toBe(2026);
  });

  it("parses a numeric prefix (parseInt semantics)", () => {
    // preserves the original `parseInt(urlYear)` behavior for trailing junk
    expect(parseUrlYear("2026abc")).toBe(2026);
  });
});

describe("parseUrlQuarter", () => {
  it("accepts Q1", () => {
    expect(parseUrlQuarter("Q1")).toBe("Q1");
  });

  it("accepts Q2, Q3, Q4", () => {
    expect(parseUrlQuarter("Q2")).toBe("Q2");
    expect(parseUrlQuarter("Q3")).toBe("Q3");
    expect(parseUrlQuarter("Q4")).toBe("Q4");
  });

  it("rejects lower-case q1", () => {
    expect(parseUrlQuarter("q1")).toBe(null);
  });

  it("rejects Q5", () => {
    expect(parseUrlQuarter("Q5")).toBe(null);
  });

  it("rejects an arbitrary string", () => {
    expect(parseUrlQuarter("foo")).toBe(null);
  });

  it("returns null for null / undefined / empty", () => {
    expect(parseUrlQuarter(null)).toBe(null);
    expect(parseUrlQuarter(undefined)).toBe(null);
    expect(parseUrlQuarter("")).toBe(null);
  });
});

describe("formatDueDate", () => {
  it("returns empty string for empty input", () => {
    expect(formatDueDate("")).toBe("");
  });

  it("returns empty string for null / undefined", () => {
    expect(formatDueDate(null)).toBe("");
    expect(formatDueDate(undefined)).toBe("");
  });

  it("formats a valid ISO date as MM/DD/YYYY", () => {
    expect(formatDueDate("2026-04-18")).toBe("04/18/2026");
  });

  it("pads single-digit months and days", () => {
    expect(formatDueDate("2026-01-05")).toBe("01/05/2026");
  });

  it("returns the raw string for invalid input", () => {
    // Date() can't parse this — we return the original
    expect(formatDueDate("not-a-date")).toBe("not-a-date");
  });
});

describe("stripHtml", () => {
  it("strips simple tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });

  it("strips nested tags", () => {
    expect(stripHtml("<p><strong>hi</strong> <em>there</em></p>")).toBe(
      "hi there"
    );
  });

  it("returns a single space for empty input (never empty)", () => {
    // docx TextRun dislikes empty strings — we always return at least " "
    expect(stripHtml("")).toBe(" ");
    expect(stripHtml(null)).toBe(" ");
    expect(stripHtml(undefined)).toBe(" ");
  });

  it("returns a single space for whitespace-only input", () => {
    expect(stripHtml("<p>   </p>")).toBe(" ");
  });

  it("preserves plain text without tags", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });
});

describe("resolveOwnerName", () => {
  const users = [
    { id: "u1", firstName: "Alice", lastName: "Singh" },
    { id: "u2", firstName: "Bob", lastName: "Chen" },
  ];

  it("returns empty string for empty id", () => {
    expect(resolveOwnerName("", users)).toBe("");
  });

  it("returns empty string for null / undefined id", () => {
    expect(resolveOwnerName(null, users)).toBe("");
    expect(resolveOwnerName(undefined, users)).toBe("");
  });

  it("returns 'First Last' when the user is found", () => {
    expect(resolveOwnerName("u1", users)).toBe("Alice Singh");
    expect(resolveOwnerName("u2", users)).toBe("Bob Chen");
  });

  it("falls back to the raw id when no user matches", () => {
    // handles historical owners whose user record was deleted
    expect(resolveOwnerName("deleted-user-id", users)).toBe("deleted-user-id");
  });

  it("works with an empty users array (always falls back)", () => {
    expect(resolveOwnerName("u1", [])).toBe("u1");
  });
});
