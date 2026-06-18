import { describe, it, expect } from "vitest";
import {
  trimStr,
  isBlank,
  isCellEmpty,
  normaliseUnit,
  normaliseDescription,
  truncateName,
  parseNumeric,
  dotDepth,
  stripRefSuffix,
  prefixParent,
  isHeaderLabel,
} from "@/lib/boq/import/cell-utils";

describe("trimStr", () => {
  it("returns '' for null/undefined and trims everything else", () => {
    expect(trimStr(null)).toBe("");
    expect(trimStr(undefined)).toBe("");
    expect(trimStr("  hi  ")).toBe("hi");
    expect(trimStr(42)).toBe("42");
  });
});

describe("isBlank", () => {
  it("is true for empty/whitespace/null", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank(null)).toBe(true);
  });
  it("is false for any content", () => {
    expect(isBlank("x")).toBe(false);
    expect(isBlank(0)).toBe(false); // "0" has length 1
  });
});

describe("isCellEmpty", () => {
  it("is true for null/undefined/whitespace strings", () => {
    expect(isCellEmpty(null)).toBe(true);
    expect(isCellEmpty(undefined)).toBe(true);
    expect(isCellEmpty("  ")).toBe(true);
  });
  it("is false for a number (even 0) and non-empty strings", () => {
    expect(isCellEmpty(0)).toBe(false);
    expect(isCellEmpty("x")).toBe(false);
  });
});

describe("normaliseUnit", () => {
  it("lowercases, collapses whitespace, strips newlines", () => {
    expect(normaliseUnit(" CU M\n")).toBe("cu m");
    expect(normaliseUnit("Cum")).toBe("cum");
  });
  it("returns '' for null/undefined", () => {
    expect(normaliseUnit(null)).toBe("");
  });
});

describe("normaliseDescription", () => {
  it("collapses whitespace and truncates to 1000 chars", () => {
    const long = "a".repeat(1500);
    expect(normaliseDescription(long).length).toBe(1000);
    expect(normaliseDescription("line1\nline2")).toBe("line1 line2");
  });
});

describe("truncateName", () => {
  it("truncates to 200 chars", () => {
    expect(truncateName("a".repeat(300)).length).toBe(200);
  });
});

describe("parseNumeric", () => {
  it("returns NaN for blanks/null", () => {
    expect(parseNumeric("")).toBeNaN();
    expect(parseNumeric(null)).toBeNaN();
  });
  it("passes numbers through", () => {
    expect(parseNumeric(5)).toBe(5);
  });
  it("strips currency, commas, whitespace", () => {
    expect(parseNumeric("₹1,500.50")).toBeCloseTo(1500.5);
  });
  it("accepts negatives and scientific notation", () => {
    expect(parseNumeric("-12")).toBe(-12);
    expect(parseNumeric("1e3")).toBe(1000);
  });
  it("returns NaN when only '-' or '.' remains", () => {
    expect(parseNumeric("-")).toBeNaN();
    expect(parseNumeric(".")).toBeNaN();
  });
});

describe("dotDepth", () => {
  it("counts dots, stripping a trailing alpha suffix", () => {
    expect(dotDepth("1")).toBe(0);
    expect(dotDepth("1.2")).toBe(1);
    expect(dotDepth("1.2.3a")).toBe(2);
    expect(dotDepth("")).toBe(0);
  });
  it("returns 0 when the cleaned ref is empty (pure letters)", () => {
    expect(dotDepth("abc")).toBe(0);
  });
});

describe("stripRefSuffix", () => {
  it("removes only a trailing alpha suffix", () => {
    expect(stripRefSuffix("1.2.3a")).toBe("1.2.3");
    expect(stripRefSuffix("1.2.3")).toBe("1.2.3");
    expect(stripRefSuffix("abc")).toBe("");
  });
});

describe("prefixParent", () => {
  it("lops the last dotted segment", () => {
    expect(prefixParent("1.2.3.4")).toBe("1.2.3");
    expect(prefixParent("4.1.1.4a")).toBe("4.1.1");
  });
  it("returns null for top-level / empty refs", () => {
    expect(prefixParent("1")).toBeNull();
    expect(prefixParent("")).toBeNull();
  });
});

describe("isHeaderLabel", () => {
  it("matches ignoring dots/spaces/case", () => {
    expect(isHeaderLabel("S.No.", ["S No"])).toBe(true);
    expect(isHeaderLabel(" boq  no ", ["BOQ No"])).toBe(true);
  });
  it("is false for a non-candidate", () => {
    expect(isHeaderLabel("Rate", ["BOQ No", "Unit"])).toBe(false);
  });
});
