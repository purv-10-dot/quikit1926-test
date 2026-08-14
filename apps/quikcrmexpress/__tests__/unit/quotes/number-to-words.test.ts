import { describe, expect, it } from "vitest";
import { amountToWordsINR } from "@/lib/services/quotes/number-to-words";

describe("amountToWordsINR", () => {
  it("handles zero", () => {
    expect(amountToWordsINR(0)).toBe("Zero Rupees Only");
  });

  it("renders singular Rupee for exactly 1", () => {
    expect(amountToWordsINR(1)).toBe("One Rupee Only");
  });

  it("renders two-digit and three-digit amounts", () => {
    expect(amountToWordsINR(150)).toBe("One Hundred Fifty Rupees Only");
    expect(amountToWordsINR(99)).toBe("Ninety Nine Rupees Only");
    expect(amountToWordsINR(305)).toBe("Three Hundred Five Rupees Only");
  });

  it("uses Indian grouping (Lakh / Crore)", () => {
    expect(amountToWordsINR(100000)).toBe("One Lakh Rupees Only");
    expect(amountToWordsINR(10000000)).toBe("One Crore Rupees Only");
    expect(amountToWordsINR(573150)).toBe(
      "Five Lakh Seventy Three Thousand One Hundred Fifty Rupees Only",
    );
    expect(amountToWordsINR(5773150)).toBe(
      "Fifty Seven Lakh Seventy Three Thousand One Hundred Fifty Rupees Only",
    );
  });

  it("renders paise after Rupees with 'and'", () => {
    expect(amountToWordsINR(1234.56)).toBe(
      "One Thousand Two Hundred Thirty Four Rupees and Fifty Six Paise Only",
    );
  });

  it("singularises Paisa for exactly 1 paisa", () => {
    expect(amountToWordsINR(10.01)).toBe(
      "Ten Rupees and One Paisa Only",
    );
  });

  it("rounds beyond two decimal places", () => {
    expect(amountToWordsINR(10.005)).toBe(
      "Ten Rupees and One Paisa Only",
    );
  });

  it("returns empty string for invalid input", () => {
    expect(amountToWordsINR(-1)).toBe("");
    expect(amountToWordsINR(Number.NaN)).toBe("");
    expect(amountToWordsINR(Number.POSITIVE_INFINITY)).toBe("");
  });
});
