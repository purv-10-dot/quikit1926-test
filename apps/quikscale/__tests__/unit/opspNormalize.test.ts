import { describe, it, expect } from "vitest";
import {
  normalizeDescOwnerRows,
  normalizeLoadedOPSP,
  emptyDescOwnerRows,
} from "@/lib/utils/opspNormalize";

describe("emptyDescOwnerRows", () => {
  it("returns exactly 5 empty rows", () => {
    const rows = emptyDescOwnerRows();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.desc === "" && r.owner === "")).toBe(true);
  });

  it("returns a fresh array on each call (no shared reference)", () => {
    const a = emptyDescOwnerRows();
    const b = emptyDescOwnerRows();
    a[0].desc = "mutated";
    expect(b[0].desc).toBe("");
  });
});

describe("normalizeDescOwnerRows — fallback paths", () => {
  it("returns 5 empty rows when value is undefined", () => {
    expect(normalizeDescOwnerRows(undefined)).toEqual(emptyDescOwnerRows());
  });

  it("returns 5 empty rows when value is null", () => {
    expect(normalizeDescOwnerRows(null)).toEqual(emptyDescOwnerRows());
  });

  it("returns 5 empty rows when value is a number", () => {
    expect(normalizeDescOwnerRows(42)).toEqual(emptyDescOwnerRows());
  });

  it("returns 5 empty rows when value is a plain object (not an array)", () => {
    expect(normalizeDescOwnerRows({ desc: "one", owner: "u1" })).toEqual(
      emptyDescOwnerRows()
    );
  });

  it("returns 5 empty rows when value is an HTML string (legacy RichEditor)", () => {
    expect(normalizeDescOwnerRows("<p>legacy html content</p>")).toEqual(
      emptyDescOwnerRows()
    );
  });
});

describe("normalizeDescOwnerRows — current shape", () => {
  it("pads a 2-row array up to 5 rows", () => {
    const out = normalizeDescOwnerRows([
      { desc: "first", owner: "u1" },
      { desc: "second", owner: "u2" },
    ]);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ desc: "first", owner: "u1" });
    expect(out[1]).toEqual({ desc: "second", owner: "u2" });
    expect(out[2]).toEqual({ desc: "", owner: "" });
    expect(out[3]).toEqual({ desc: "", owner: "" });
    expect(out[4]).toEqual({ desc: "", owner: "" });
  });

  it("truncates a 7-row array down to 5 rows", () => {
    const over = Array.from({ length: 7 }, (_, i) => ({
      desc: `row${i}`,
      owner: `u${i}`,
    }));
    const out = normalizeDescOwnerRows(over);
    expect(out).toHaveLength(5);
    expect(out[4]).toEqual({ desc: "row4", owner: "u4" });
    // rows 5 and 6 are dropped
  });

  it("returns exactly 5 rows when input is already 5", () => {
    const exactly5 = [
      { desc: "a", owner: "u1" },
      { desc: "b", owner: "u2" },
      { desc: "c", owner: "u3" },
      { desc: "d", owner: "u4" },
      { desc: "e", owner: "u5" },
    ];
    expect(normalizeDescOwnerRows(exactly5)).toEqual(exactly5);
  });

  it("accepts an empty array and pads to 5", () => {
    expect(normalizeDescOwnerRows([])).toEqual(emptyDescOwnerRows());
  });
});

describe("normalizeDescOwnerRows — legacy shapes", () => {
  it("wraps a string[] array (legacy numbered-rows flow) as {desc, owner:''}", () => {
    const out = normalizeDescOwnerRows(["Ship v2", "Hire PM", "Raise round"]);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ desc: "Ship v2", owner: "" });
    expect(out[1]).toEqual({ desc: "Hire PM", owner: "" });
    expect(out[2]).toEqual({ desc: "Raise round", owner: "" });
    expect(out[3]).toEqual({ desc: "", owner: "" });
  });

  it("coerces malformed row entries to empty {desc,owner}", () => {
    const out = normalizeDescOwnerRows([
      { desc: "valid", owner: "u1" },
      null,              // bad row
      42,                // bad row
      [1, 2, 3],          // array is rejected (not a plain object)
      { desc: 99 },       // non-string desc
    ]);
    expect(out[0]).toEqual({ desc: "valid", owner: "u1" });
    expect(out[1]).toEqual({ desc: "", owner: "" });
    expect(out[2]).toEqual({ desc: "", owner: "" });
    expect(out[3]).toEqual({ desc: "", owner: "" });
    expect(out[4]).toEqual({ desc: "", owner: "" });
  });

  it("extracts desc when present but ignores non-string desc fields", () => {
    const out = normalizeDescOwnerRows([
      { desc: "ok", owner: "u1" },
      { desc: 123, owner: "u2" },
      { desc: undefined, owner: "u3" },
      { desc: null, owner: "u4" },
    ]);
    expect(out[0].desc).toBe("ok");
    expect(out[1].desc).toBe("");
    expect(out[2].desc).toBe("");
    expect(out[3].desc).toBe("");
    // owners that ARE strings must be preserved even when desc is bad
    expect(out[1].owner).toBe("u2");
    expect(out[2].owner).toBe("u3");
    expect(out[3].owner).toBe("u4");
  });

  it("extracts owner when present but ignores non-string owner fields", () => {
    const out = normalizeDescOwnerRows([
      { desc: "x", owner: 123 },
      { desc: "y", owner: null },
      { desc: "z", owner: undefined },
    ]);
    expect(out[0]).toEqual({ desc: "x", owner: "" });
    expect(out[1]).toEqual({ desc: "y", owner: "" });
    expect(out[2]).toEqual({ desc: "z", owner: "" });
  });

  it("handles mixed string[] + object[] array", () => {
    const out = normalizeDescOwnerRows([
      "legacy string",
      { desc: "new style", owner: "u1" },
      "another legacy",
    ]);
    expect(out[0]).toEqual({ desc: "legacy string", owner: "" });
    expect(out[1]).toEqual({ desc: "new style", owner: "u1" });
    expect(out[2]).toEqual({ desc: "another legacy", owner: "" });
    expect(out[3]).toEqual({ desc: "", owner: "" });
    expect(out[4]).toEqual({ desc: "", owner: "" });
  });
});

describe("normalizeLoadedOPSP", () => {
  it("returns a new object (doesn't mutate input)", () => {
    const input = { rocks: "legacy html", keyInitiatives: "also legacy" };
    const output = normalizeLoadedOPSP(input);
    expect(output).not.toBe(input);
    expect(input.rocks).toBe("legacy html"); // input untouched
  });

  it("normalizes both rocks and keyInitiatives fields", () => {
    const input = {
      rocks: [{ desc: "r1", owner: "u1" }],
      keyInitiatives: [{ desc: "k1", owner: "u2" }],
    };
    const out = normalizeLoadedOPSP(input);
    expect(out.rocks).toHaveLength(5);
    expect(out.keyInitiatives).toHaveLength(5);
    expect((out.rocks as any[])[0]).toEqual({ desc: "r1", owner: "u1" });
    expect((out.keyInitiatives as any[])[0]).toEqual({ desc: "k1", owner: "u2" });
  });

  it("adds empty rows when rocks is missing entirely", () => {
    const input = { keyInitiatives: [] };
    const out = normalizeLoadedOPSP(input);
    expect(out.rocks).toEqual(emptyDescOwnerRows());
  });

  it("adds empty rows when keyInitiatives is missing entirely", () => {
    const input = { rocks: [{ desc: "r1", owner: "u1" }] };
    const out = normalizeLoadedOPSP(input);
    expect(out.keyInitiatives).toEqual(emptyDescOwnerRows());
  });

  it("handles a legacy HTML-string payload for both fields", () => {
    const input = {
      rocks: "<p>Ship v2</p>",
      keyInitiatives: "<ul><li>Build backlog</li></ul>",
    };
    const out = normalizeLoadedOPSP(input);
    expect(out.rocks).toEqual(emptyDescOwnerRows());
    expect(out.keyInitiatives).toEqual(emptyDescOwnerRows());
  });

  it("passes unrelated fields through untouched", () => {
    const input = {
      year: 2026,
      quarter: "Q1",
      theme: "Customer love",
      coreValues: "Honesty, Speed",
      employees: ["a", "b", "c"],
      rocks: [],
      keyInitiatives: [],
    };
    const out = normalizeLoadedOPSP(input);
    expect(out.year).toBe(2026);
    expect(out.quarter).toBe("Q1");
    expect(out.theme).toBe("Customer love");
    expect(out.coreValues).toBe("Honesty, Speed");
    expect(out.employees).toEqual(["a", "b", "c"]);
  });

  it("handles a realistic loaded payload from the DB", () => {
    const input = {
      year: 2026,
      quarter: "Q2",
      status: "draft",
      targetYears: 5,
      employees: ["great culture", "clear vision", "motivated team"],
      customers: ["quick reply", "trusted partner", "happy clients"],
      rocks: [
        { desc: "Ship v2 launch", owner: "user-1" },
        { desc: "Hire VP Eng", owner: "user-2" },
      ],
      keyInitiatives: [
        { desc: "Customer research sprint", owner: "user-3" },
      ],
      coreValues: "Integrity\nCourage",
    };
    const out = normalizeLoadedOPSP(input);
    expect((out.rocks as any[]).length).toBe(5);
    expect((out.keyInitiatives as any[]).length).toBe(5);
    expect((out.rocks as any[])[0].desc).toBe("Ship v2 launch");
    expect((out.keyInitiatives as any[])[0].desc).toBe("Customer research sprint");
    expect(out.employees).toEqual(["great culture", "clear vision", "motivated team"]);
  });

  it("handles an empty object input", () => {
    const out = normalizeLoadedOPSP({});
    expect(out.rocks).toEqual(emptyDescOwnerRows());
    expect(out.keyInitiatives).toEqual(emptyDescOwnerRows());
  });

  it("preserves only 5 rocks even when input has 10", () => {
    const rocks = Array.from({ length: 10 }, (_, i) => ({
      desc: `rock${i}`,
      owner: `u${i}`,
    }));
    const out = normalizeLoadedOPSP({ rocks });
    expect((out.rocks as any[]).length).toBe(5);
    expect((out.rocks as any[])[4].desc).toBe("rock4");
  });
});
