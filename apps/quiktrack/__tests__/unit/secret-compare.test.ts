import { describe, it, expect } from "vitest";
import { safeSecretEqual } from "@/lib/secret-compare";

// REL-05 regression: server-to-server secret comparison must be constant-time
// and fail-closed. It accepts an exact match and rejects everything else,
// including inputs of a different length (which must not throw).

describe("safeSecretEqual (REL-05)", () => {
  it("accepts an exact match", () => {
    expect(safeSecretEqual("s3cr3t-value", "s3cr3t-value")).toBe(true);
  });

  it("rejects a wrong value of the same length", () => {
    expect(safeSecretEqual("s3cr3t-valuE", "s3cr3t-value")).toBe(false);
  });

  it("rejects (without throwing) values of different lengths", () => {
    expect(safeSecretEqual("short", "a-much-longer-secret")).toBe(false);
    expect(safeSecretEqual("a-much-longer-secret", "short")).toBe(false);
  });

  it("fails closed on missing/empty input", () => {
    expect(safeSecretEqual(null, "x")).toBe(false);
    expect(safeSecretEqual("x", null)).toBe(false);
    expect(safeSecretEqual(undefined, "x")).toBe(false);
    expect(safeSecretEqual("", "")).toBe(false);
    expect(safeSecretEqual(null, null)).toBe(false);
  });

  it("does not treat a prefix as a match", () => {
    expect(safeSecretEqual("secret", "secret-plus-more")).toBe(false);
  });
});
