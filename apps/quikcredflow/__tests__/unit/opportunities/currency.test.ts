import { describe, expect, it } from "vitest";
import {
  formatINR,
  formatCompact,
  formatGeneric,
  toNumber,
} from "@/lib/services/opportunities/currency";

describe("formatINR", () => {
  it("renders crore for amounts >= 1Cr", () => {
    expect(formatINR(21_000_000)).toBe("₹2.1Cr");
  });

  it("renders lakh for amounts >= 1L and < 1Cr", () => {
    expect(formatINR(5_800_000)).toBe("₹58L");
  });

  it("renders the raw amount with Indian grouping below 1L", () => {
    expect(formatINR(50_000)).toBe("₹50,000");
  });

  it("strips a trailing .0 from compact crore/lakh output", () => {
    expect(formatINR(20_000_000)).toBe("₹2Cr");
    expect(formatINR(50_00_000)).toBe("₹50L");
  });

  it("treats null/undefined/NaN as zero", () => {
    expect(formatINR(null)).toBe("₹0");
    expect(formatINR(undefined)).toBe("₹0");
    expect(formatINR(NaN)).toBe("₹0");
  });
});

describe("formatCompact", () => {
  it("uses Intl compact notation for non-INR currencies", () => {
    expect(formatCompact(51_000, "USD")).toBe("$51K");
    expect(formatCompact(2_400_000, "USD")).toBe("$2.4M");
    expect(formatCompact(500, "EUR")).toBe("€500");
  });
});

describe("formatGeneric", () => {
  it("dispatches INR to formatINR and others to formatCompact", () => {
    expect(formatGeneric(21_000_000, "INR")).toBe("₹2.1Cr");
    expect(formatGeneric(51_000, "USD")).toBe("$51K");
  });
});

describe("toNumber", () => {
  it("coerces null, string, and Decimal-like values to a JS number", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber("123.45")).toBe(123.45);
    expect(toNumber({ toString: () => "987.65" })).toBe(987.65);
  });
});
