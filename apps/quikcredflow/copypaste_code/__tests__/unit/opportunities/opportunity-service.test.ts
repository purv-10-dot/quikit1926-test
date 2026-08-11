import { describe, expect, it } from "vitest";
import {
  computeWeightedAmount,
  computeProductLineTotal,
} from "@/lib/services/opportunities/compute";

describe("computeProductLineTotal", () => {
  it("multiplies qty * unitPrice and applies discount, rounded to 2 dp", () => {
    expect(computeProductLineTotal(2, 100, 0)).toBe(200);
    expect(computeProductLineTotal(3, 99.99, 10)).toBe(269.97);
    expect(computeProductLineTotal(1, 1000, 100)).toBe(0);
  });
});

describe("computeWeightedAmount", () => {
  it("multiplies amount by probability/100 and rounds to 2 dp", () => {
    expect(computeWeightedAmount(100_000, 25)).toBe(25_000);
    expect(computeWeightedAmount(123_456, 33)).toBe(40_740.48);
  });

  it("handles Prisma Decimal-like inputs (string/object)", () => {
    expect(computeWeightedAmount("200000", 50)).toBe(100_000);
    expect(computeWeightedAmount({ toString: () => "150000" }, 10)).toBe(15_000);
  });

  it("returns null when amount is missing", () => {
    expect(computeWeightedAmount(null, 50)).toBeNull();
    expect(computeWeightedAmount(undefined, 50)).toBeNull();
  });

  it("treats probability 0 as 0 (closed-lost case)", () => {
    expect(computeWeightedAmount(100_000, 0)).toBe(0);
  });
});
