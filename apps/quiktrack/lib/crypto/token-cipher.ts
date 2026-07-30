/**
 * AES-256-GCM encryption for GitHub OAuth / installation tokens stored at rest.
 *
 * GitHub user access tokens, refresh tokens, and cached installation access
 * tokens must never be persisted in plaintext. This module encrypts them with a
 * symmetric key from GITHUB_TOKEN_ENCRYPTION_KEY (a base64-encoded 32-byte key).
 * GCM gives us confidentiality + an auth tag, so a tampered ciphertext fails to
 * decrypt rather than silently returning garbage.
 *
 * Serialized format (single string, colon-delimited base64 parts):
 *   v1:<iv>:<authTag>:<ciphertext>
 * The "v1" prefix lets us rotate the scheme later without ambiguity.
 *
 * Uses only Node's built-in `crypto` — no new dependency (app CLAUDE.md rule 3).
 * Cloned from apps/quikcrm/lib/crypto/token-cipher.ts (the sanctioned pattern);
 * only the env var name and the domain wording differ.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce is the GCM standard/recommended size
const KEY_BYTES = 32; // AES-256
const VERSION = "v1";

export class TokenCipherError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "TokenCipherError";
    this.statusCode = statusCode;
  }
}

/**
 * Resolve and validate the 32-byte key from the environment.
 * Read lazily (per call) so tests can set the env var before use and so an
 * unconfigured deployment fails only when GitHub is actually connected.
 */
function getKey(): Buffer {
  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new TokenCipherError(
      "GITHUB_TOKEN_ENCRYPTION_KEY is not set — cannot store GitHub tokens. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new TokenCipherError("GITHUB_TOKEN_ENCRYPTION_KEY is not valid base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new TokenCipherError(
      `GITHUB_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}).`,
    );
  }
  return key;
}

/** Encrypt a plaintext token into the versioned serialized string. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a serialized token string. Throws TokenCipherError on any malformed
 * input or authentication-tag failure (tampering / wrong key) — never returns
 * partial or corrupted output.
 */
export function decryptToken(serialized: string): string {
  const key = getKey();
  const parts = serialized.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCipherError("Encrypted token is malformed or uses an unknown version.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // GCM auth failure or bad base64 — treat both as a hard decrypt failure.
    throw new TokenCipherError("Failed to decrypt token (tampered, corrupted, or wrong key).");
  }
}

/** True when a valid encryption key is configured (used to gate the feature). */
export function isTokenCipherConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
