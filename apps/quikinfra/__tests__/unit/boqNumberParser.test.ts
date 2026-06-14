import { describe, it, expect } from "vitest";
import { parseIndianNumber, isNumericCell } from "@/lib/boq/import/number-parser";

describe("parseIndianNumber", () => {
  it("returns NaN for null / undefined / empty string", () => {
    expect(parseIndianNumber(null)).toBeNaN();
    expect(parseIndianNumber(undefined)).toBeNaN();
    expect(parseIndianNumber("")).toBeNaN();
  });

  it("passes through real numbers untouched (including negatives and 0)", () => {
    expect(parseIndianNumber(42)).toBe(42);
    expect(parseIndianNumber(-3.5)).toBe(-3.5);
    expect(parseIndianNumber(0)).toBe(0);
  });

  it("returns NaN for a string that is only whitespace", () => {
    expect(parseIndianNumber("   ")).toBeNaN();
  });

  it("treats nil/placeholder tokens as 0", () => {
    expect(parseIndianNumber("-")).toBe(0);
    expect(parseIndianNumber("---")).toBe(0);
    expect(parseIndianNumber("nil")).toBe(0);
    expect(parseIndianNumber("NA")).toBe(0);
    expect(parseIndianNumber("n/a")).toBe(0);
    expect(parseIndianNumber("IR")).toBe(0);
    expect(parseIndianNumber("I.R.")).toBe(0);
  });

  it("parses Indian lakh grouping", () => {
    expect(parseIndianNumber("9,26,500")).toBe(926500);
    expect(parseIndianNumber("1,23,456.78")).toBeCloseTo(123456.78);
  });

  it("strips currency prefixes", () => {
    expect(parseIndianNumber("₹1,500.50")).toBeCloseTo(1500.5);
    expect(parseIndianNumber("$2,000")).toBe(2000);
  });

  it("treats accountant parentheses as negative", () => {
    expect(parseIndianNumber("(500)")).toBe(-500);
    expect(parseIndianNumber("(1,234.50)")).toBeCloseTo(-1234.5);
  });

  it("handles the lakh suffix (case-insensitive)", () => {
    expect(parseIndianNumber("2.5L")).toBe(250000);
    expect(parseIndianNumber("3 l")).toBe(300000);
  });

  it("handles the crore suffix (case-insensitive)", () => {
    expect(parseIndianNumber("3Cr")).toBe(30000000);
    expect(parseIndianNumber("1.5 cr")).toBe(15000000);
  });

  it("returns NaN for non-numeric junk", () => {
    expect(parseIndianNumber("abc")).toBeNaN();
    expect(parseIndianNumber("N.A. (text)")).toBeNaN();
  });

  it("returns NaN when only a lone dot or dash remains after stripping", () => {
    expect(parseIndianNumber(".")).toBeNaN();
  });

  it("parses a plain decimal", () => {
    expect(parseIndianNumber("123.45")).toBeCloseTo(123.45);
  });
});

describe("isNumericCell", () => {
  it("is true for parseable numbers and nil tokens (which map to 0)", () => {
    expect(isNumericCell("1,000")).toBe(true);
    expect(isNumericCell("nil")).toBe(true);
    expect(isNumericCell(0)).toBe(true);
  });

  it("is false for blanks and junk", () => {
    expect(isNumericCell("")).toBe(false);
    expect(isNumericCell(null)).toBe(false);
    expect(isNumericCell("abc")).toBe(false);
  });
});
