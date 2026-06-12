import { describe, expect, it } from "vitest";
import { normalisePhoneE164 } from "@/lib/services/contacts/phone";

describe("normalisePhoneE164", () => {
  it("returns empty for empty / null / whitespace input", () => {
    expect(normalisePhoneE164("")).toBe("");
    expect(normalisePhoneE164(null)).toBe("");
    expect(normalisePhoneE164(undefined)).toBe("");
    expect(normalisePhoneE164("   ")).toBe("");
  });

  it("preserves an explicit + prefix and strips formatting", () => {
    expect(normalisePhoneE164("+91 98765 43210")).toBe("+919876543210");
    expect(normalisePhoneE164("+44 (770) 090-0111")).toBe("+447700900111");
  });

  it("defaults a 10-digit local number to +91", () => {
    expect(normalisePhoneE164("9876543210")).toBe("+919876543210");
  });

  it("strips a leading 0 from an 11-digit Indian STD number", () => {
    expect(normalisePhoneE164("09876543210")).toBe("+919876543210");
  });

  it("inserts + when 91 prefix is implicit (12 digits)", () => {
    expect(normalisePhoneE164("919876543210")).toBe("+919876543210");
  });

  it("falls back to + + digits for unknown shapes", () => {
    expect(normalisePhoneE164("123")).toBe("+123");
  });
});
