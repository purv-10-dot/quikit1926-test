import { describe, it, expect, beforeAll } from "vitest";
import { encryptField, decryptField, maskAccountNumber } from "@/lib/crypto";

describe("field encryption", () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = "test-encryption-key-1234567890";
  });

  it("round-trips an encrypted value", () => {
    const stored = encryptField("50100123456789");
    expect(stored).toMatch(/^enc:v1:/);
    expect(decryptField(stored)).toBe("50100123456789");
  });

  it("returns null for empty input", () => {
    expect(encryptField("")).toBeNull();
    expect(encryptField(null)).toBeNull();
  });

  it("masks all but the last four characters", () => {
    expect(maskAccountNumber("50100123456789")).toBe("••••••••••6789");
    expect(maskAccountNumber("")).toBe("");
  });
});
