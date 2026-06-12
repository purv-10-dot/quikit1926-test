/**
 * AES-256-GCM encryption for at-rest secrets (e.g. IntegrationConfig credentials).
 *
 * Layout of returned ciphertext (base64-encoded as a single string):
 *   v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 *
 * Key derivation: SHA-256 of (CRYPTO_SECRET || JWT_SECRET) → 32 bytes.
 * Set CRYPTO_SECRET separately in production to allow JWT_SECRET rotation
 * without re-encrypting all integration secrets.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";
const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  // CRYPTO_SECRET is preferred; fall back to JWT_SECRET for dev convenience
  const seed = (process.env.CRYPTO_SECRET ?? "") || env().JWT_SECRET;
  if (!seed) throw new Error("AES-GCM key seed missing (set CRYPTO_SECRET or JWT_SECRET)");
  return createHash("sha256").update(seed, "utf8").digest();
}

export function encrypt(plain: string): string {
  if (plain == null) throw new Error("Cannot encrypt null/undefined");
  const key = deriveKey();
  const iv = randomBytes(12); // 96-bit IV per GCM recommendation
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted blob format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const data = Buffer.from(dataB64!, "base64");
  const decipher = createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/** Safe round-trip helpers that return null when the input is null/empty. */
export function encryptOrNull(plain: string | null | undefined): string | null {
  return plain == null || plain === "" ? null : encrypt(plain);
}

export function decryptOrNull(blob: string | null | undefined): string | null {
  return blob == null || blob === "" ? null : decrypt(blob);
}
