/**
 * Authenticated encryption for calendar refresh tokens at rest (S15b). MS
 * per-user OAuth tokens are stored ONLY as ciphertext — never plaintext, never
 * logged. AES-256-GCM with a key from `CALENDAR_TOKEN_ENC_KEY` (32-byte key,
 * supplied base64 or hex, or any string hashed to 32 bytes as a dev fallback).
 *
 * Wire format: `v1.<iv b64url>.<authTag b64url>.<ciphertext b64url>`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** Derive a 32-byte key from the env value (accepts base64/hex/raw). */
export function resolveEncKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  // Try base64 / hex of exactly 32 bytes; otherwise hash to a stable 32 bytes.
  for (const enc of ["base64", "hex"] as const) {
    try {
      const buf = Buffer.from(raw, enc);
      if (buf.length === 32) return buf;
    } catch {
      /* ignore */
    }
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function decryptToken(blob: string, key: Buffer): string {
  const [version, ivB64, tagB64, ctB64] = blob.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("malformed encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
