import { describe, it, expect } from "vitest";
import {
  parseProjectedValue,
  combineProjectedValue,
} from "@/app/(dashboard)/opsp/components/category";

describe("parseProjectedValue", () => {
  it("returns empty when input is empty", () => {
    expect(parseProjectedValue("", "USD")).toEqual({ num: "", scale: "" });
  });

  it("returns empty when input is only whitespace", () => {
    expect(parseProjectedValue("   ", "USD")).toEqual({ num: "", scale: "" });
  });

  it("parses a plain number with no scale", () => {
    expect(parseProjectedValue("250", "USD")).toEqual({ num: "250", scale: "" });
  });

  it("parses a USD number with K (Thousand)", () => {
    expect(parseProjectedValue("250 K", "USD")).toEqual({
      num: "250",
      scale: "K",
    });
  });

  it("parses a USD number with M (Million)", () => {
    expect(parseProjectedValue("1.5 M", "USD")).toEqual({
      num: "1.5",
      scale: "M",
    });
  });

  it("parses a USD number with B (Billion)", () => {
    expect(parseProjectedValue("3 B", "USD")).toEqual({ num: "3", scale: "B" });
  });

  it("parses an INR number with L (Lakh)", () => {
    expect(parseProjectedValue("500 L", "INR")).toEqual({
      num: "500",
      scale: "L",
    });
  });

  it("parses an INR number with Cr (Crore)", () => {
    expect(parseProjectedValue("100 Cr", "INR")).toEqual({
      num: "100",
      scale: "Cr",
    });
  });

  it("treats unknown trailing token as part of the number", () => {
    // "XYZ" is not a valid scale, so the whole thing becomes the num
    expect(parseProjectedValue("250 XYZ", "USD")).toEqual({
      num: "250 XYZ",
      scale: "",
    });
  });

  it("does NOT recognize Lakh scale for USD currency", () => {
    // "L" is not in USD's scale list — should fall through to plain text
    expect(parseProjectedValue("500 L", "USD")).toEqual({
      num: "500 L",
      scale: "",
    });
  });

  it("handles decimal numbers with scale", () => {
    expect(parseProjectedValue("1000.50 K", "USD")).toEqual({
      num: "1000.50",
      scale: "K",
    });
  });
});

describe("combineProjectedValue", () => {
  it("returns empty string for empty num", () => {
    expect(combineProjectedValue("", "K")).toBe("");
  });

  it("returns empty string for whitespace num", () => {
    expect(combineProjectedValue("   ", "K")).toBe("");
  });

  it("returns just the number when scale is empty", () => {
    expect(combineProjectedValue("250", "")).toBe("250");
  });

  it("returns just the number when scale is '-'", () => {
    expect(combineProjectedValue("250", "-")).toBe("250");
  });

  it("combines num + scale with a space", () => {
    expect(combineProjectedValue("250", "K")).toBe("250 K");
  });

  it("combines num + scale for Crore", () => {
    expect(combineProjectedValue("100", "Cr")).toBe("100 Cr");
  });

  it("trims whitespace from num before combining", () => {
    expect(combineProjectedValue("  250  ", "M")).toBe("250 M");
  });
});

describe("parseProjectedValue ↔ combineProjectedValue round-trip", () => {
  it("USD values round-trip", () => {
    const cases: Array<[string, string]> = [
      ["250", ""],
      ["250", "K"],
      ["1.5", "M"],
      ["3", "B"],
    ];
    for (const [num, scale] of cases) {
      const combined = combineProjectedValue(num, scale);
      const parsed = parseProjectedValue(combined, "USD");
      expect(parsed.num).toBe(num);
      expect(parsed.scale).toBe(scale);
    }
  });

  it("INR values round-trip", () => {
    const cases: Array<[string, string]> = [
      ["500", "L"],
      ["100", "Cr"],
    ];
    for (const [num, scale] of cases) {
      const combined = combineProjectedValue(num, scale);
      const parsed = parseProjectedValue(combined, "INR");
      expect(parsed.num).toBe(num);
      expect(parsed.scale).toBe(scale);
    }
  });
});
