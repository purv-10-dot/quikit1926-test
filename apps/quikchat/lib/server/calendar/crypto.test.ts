import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, resolveEncKey } from "./crypto";

describe("calendar token crypto", () => {
  const key = resolveEncKey("a-dev-secret-string")!;

  it("round-trips a token through encrypt/decrypt", () => {
    const blob = encryptToken("refresh-token-xyz", key);
    expect(blob).not.toContain("refresh-token-xyz"); // never plaintext
    expect(blob.startsWith("v1.")).toBe(true);
    expect(decryptToken(blob, key)).toBe("refresh-token-xyz");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects a tampered blob", () => {
    const blob = encryptToken("secret", key);
    const tampered = blob.slice(0, -2) + (blob.endsWith("a") ? "bb" : "aa");
    expect(() => decryptToken(tampered, key)).toThrow();
  });

  it("rejects a malformed blob", () => {
    expect(() => decryptToken("not-a-blob", key)).toThrow(/malformed/);
  });

  it("resolveEncKey accepts base64/hex 32-byte keys and hashes raw strings", () => {
    expect(resolveEncKey(undefined)).toBeNull();
    expect(resolveEncKey("x".repeat(43) + "=")).toHaveLength(32); // ~base64 of 32B
    expect(resolveEncKey("00".repeat(32))).toHaveLength(32); // hex
    expect(resolveEncKey("short")).toHaveLength(32); // hashed fallback
  });
});
