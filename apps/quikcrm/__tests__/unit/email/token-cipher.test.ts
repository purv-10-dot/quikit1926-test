import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import {
  decryptToken,
  encryptToken,
  isTokenCipherConfigured,
  TokenCipherError,
} from "@/lib/crypto/token-cipher";

const KEY = randomBytes(32).toString("base64");

describe("token-cipher", () => {
  beforeEach(() => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips a token", () => {
    const secret = "ya29.a0AfB_by-refresh-token-value-xyz";
    const enc = encryptToken(secret);
    expect(enc).not.toContain(secret); // never plaintext
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptToken(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptToken("same-input");
    const b = encryptToken("same-input");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same-input");
    expect(decryptToken(b)).toBe("same-input");
  });

  it("round-trips unicode and empty strings", () => {
    expect(decryptToken(encryptToken(""))).toBe("");
    expect(decryptToken(encryptToken("café ☕ 你好"))).toBe("café ☕ 你好");
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptToken("secret");
    const parts = enc.split(":");
    // Flip a byte in the ciphertext segment.
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 0xff;
    parts[3] = data.toString("base64");
    expect(() => decryptToken(parts.join(":"))).toThrow(TokenCipherError);
  });

  it("rejects malformed / wrong-version input", () => {
    expect(() => decryptToken("not-a-token")).toThrow(TokenCipherError);
    expect(() => decryptToken("v2:a:b:c")).toThrow(TokenCipherError);
  });

  it("fails to decrypt with a different key", () => {
    const enc = encryptToken("secret");
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(enc)).toThrow(TokenCipherError);
  });

  it("throws a clear error when the key is missing", () => {
    delete process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
    expect(isTokenCipherConfigured()).toBe(false);
    expect(() => encryptToken("x")).toThrow(/MAILBOX_TOKEN_ENCRYPTION_KEY is not set/);
  });

  it("rejects a wrong-length key", () => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(isTokenCipherConfigured()).toBe(false);
    expect(() => encryptToken("x")).toThrow(/must decode to 32 bytes/);
  });

  it("reports configured when a valid key is present", () => {
    expect(isTokenCipherConfigured()).toBe(true);
  });
});
