import { describe, it, expect } from "vitest";
import { generatePatToken, hashPatToken, isPatValid } from "@/lib/api/patToken";

describe("generatePatToken()", () => {
  it("returns a non-empty string with high-entropy length", () => {
    const token = generatePatToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("returns a different value on each call", () => {
    expect(generatePatToken()).not.toBe(generatePatToken());
  });
});

describe("hashPatToken()", () => {
  it("is deterministic for the same input", () => {
    expect(hashPatToken("abc")).toBe(hashPatToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashPatToken("abc")).not.toBe(hashPatToken("xyz"));
  });

  it("never returns the raw token itself", () => {
    const token = generatePatToken();
    expect(hashPatToken(token)).not.toBe(token);
  });
});

describe("isPatValid()", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");

  it("is valid when not expired and not revoked", () => {
    const record = {
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      revokedAt: null,
    };
    expect(isPatValid(record, now)).toBe(true);
  });

  it("is invalid when expiresAt is in the past", () => {
    const record = {
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
      revokedAt: null,
    };
    expect(isPatValid(record, now)).toBe(false);
  });

  it("is invalid when revokedAt is set, even if not expired", () => {
    const record = {
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      revokedAt: new Date("2026-07-27T00:00:00.000Z"),
    };
    expect(isPatValid(record, now)).toBe(false);
  });
});
