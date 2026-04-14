import { describe, it, expect } from "vitest";
import {
  CURRENCIES,
  SCALES_WESTERN,
  SCALES_INR,
  getScales,
  getMultiplier,
  formatActual,
} from "../../lib/utils/currency";

describe("CURRENCIES constant", () => {
  it("contains 10 currencies", () => {
    expect(CURRENCIES).toHaveLength(10);
  });

  it("each entry has code, symbol, and name", () => {
    for (const c of CURRENCIES) {
      expect(c).toHaveProperty("code");
      expect(c).toHaveProperty("symbol");
      expect(c).toHaveProperty("name");
      expect(typeof c.code).toBe("string");
      expect(typeof c.symbol).toBe("string");
      expect(typeof c.name).toBe("string");
    }
  });

  it("includes USD, EUR, GBP, INR, JPY", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(codes).toContain("USD");
    expect(codes).toContain("EUR");
    expect(codes).toContain("GBP");
    expect(codes).toContain("INR");
    expect(codes).toContain("JPY");
  });
});

describe("SCALES_WESTERN constant", () => {
  it("has 5 entries from base to Trillion", () => {
    expect(SCALES_WESTERN).toHaveLength(5);
    expect(SCALES_WESTERN[0]).toEqual({ label: "", multiplier: 1 });
    expect(SCALES_WESTERN[1]).toEqual({ label: "Thousand", multiplier: 1e3 });
    expect(SCALES_WESTERN[2]).toEqual({ label: "Million", multiplier: 1e6 });
    expect(SCALES_WESTERN[3]).toEqual({ label: "Billion", multiplier: 1e9 });
    expect(SCALES_WESTERN[4]).toEqual({ label: "Trillion", multiplier: 1e12 });
  });
});

describe("SCALES_INR constant", () => {
  it("has 5 entries from base to Hundred Crore", () => {
    expect(SCALES_INR).toHaveLength(5);
    expect(SCALES_INR[0]).toEqual({ label: "", multiplier: 1 });
    expect(SCALES_INR[1]).toEqual({ label: "Thousand", multiplier: 1e3 });
    expect(SCALES_INR[2]).toEqual({ label: "Lakh", multiplier: 1e5 });
    expect(SCALES_INR[3]).toEqual({ label: "Crore", multiplier: 1e7 });
    expect(SCALES_INR[4]).toEqual({ label: "Hundred Crore", multiplier: 1e9 });
  });
});

describe("getScales", () => {
  it("returns SCALES_INR for INR currency", () => {
    expect(getScales("INR")).toBe(SCALES_INR);
  });

  it("returns SCALES_WESTERN for USD", () => {
    expect(getScales("USD")).toBe(SCALES_WESTERN);
  });

  it("returns SCALES_WESTERN for EUR", () => {
    expect(getScales("EUR")).toBe(SCALES_WESTERN);
  });

  it("returns SCALES_WESTERN for any non-INR currency", () => {
    expect(getScales("GBP")).toBe(SCALES_WESTERN);
    expect(getScales("JPY")).toBe(SCALES_WESTERN);
    expect(getScales("AED")).toBe(SCALES_WESTERN);
    expect(getScales("XYZ")).toBe(SCALES_WESTERN);
  });
});

describe("getMultiplier", () => {
  it("returns 1 for empty label (base scale) in western", () => {
    expect(getMultiplier("USD", "")).toBe(1);
  });

  it("returns correct multiplier for Thousand", () => {
    expect(getMultiplier("USD", "Thousand")).toBe(1e3);
  });

  it("returns correct multiplier for Million", () => {
    expect(getMultiplier("USD", "Million")).toBe(1e6);
  });

  it("returns correct multiplier for Billion", () => {
    expect(getMultiplier("USD", "Billion")).toBe(1e9);
  });

  it("returns correct multiplier for Trillion", () => {
    expect(getMultiplier("USD", "Trillion")).toBe(1e12);
  });

  it("returns Lakh multiplier for INR", () => {
    expect(getMultiplier("INR", "Lakh")).toBe(1e5);
  });

  it("returns Crore multiplier for INR", () => {
    expect(getMultiplier("INR", "Crore")).toBe(1e7);
  });

  it("returns Hundred Crore multiplier for INR", () => {
    expect(getMultiplier("INR", "Hundred Crore")).toBe(1e9);
  });

  it("returns 1 as fallback when scale label is not found", () => {
    expect(getMultiplier("USD", "NonExistentScale")).toBe(1);
  });

  it("returns 1 for INR-specific scale when currency is not INR", () => {
    expect(getMultiplier("USD", "Lakh")).toBe(1);
    expect(getMultiplier("USD", "Crore")).toBe(1);
  });
});

describe("formatActual", () => {
  it("formats USD values with US locale", () => {
    const result = formatActual(1000, "$", "USD");
    expect(result).toBe("$1,000");
  });

  it("formats large USD values with commas", () => {
    const result = formatActual(1234567, "$", "USD");
    expect(result).toBe("$1,234,567");
  });

  it("formats INR values with Indian locale", () => {
    const result = formatActual(1234567, "₹", "INR");
    expect(result).toBe("₹12,34,567");
  });

  it("formats zero", () => {
    expect(formatActual(0, "$", "USD")).toBe("$0");
  });

  it("formats EUR with euro symbol using US locale", () => {
    const result = formatActual(5000, "€", "EUR");
    expect(result).toBe("€5,000");
  });

  it("formats decimal values", () => {
    const result = formatActual(1234.56, "$", "USD");
    expect(result).toBe("$1,234.56");
  });

  it("formats negative values", () => {
    const result = formatActual(-500, "$", "USD");
    expect(result).toContain("$");
    expect(result).toContain("500");
  });

  it("formats small values without commas", () => {
    expect(formatActual(99, "£", "GBP")).toBe("£99");
  });
});
