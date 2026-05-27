/**
 * Password hashing — scrypt via node:crypto.
 *
 * No bcrypt / argon2 dependency. Scrypt is memory-hard and NIST-recommended
 * for password hashing. Stored format: "<salt_hex>:<hash_hex>".
 *
 * The seed writes hashes in this format; this module verifies incoming
 * plaintext against them. Both sides must stay in sync — if you ever
 * change the cost parameters (salt length, key length, N/r/p), bump a
 * version prefix on the stored hash and handle both formats during the
 * migration window.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hash a plaintext password. Returns "<salt_hex>:<hash_hex>".
 * Salt is fresh random bytes on every call, so hashing the same password
 * twice yields different outputs (correct for password storage).
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(plain, salt, KEY_BYTES).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a plaintext password against a stored hash. Returns true on match.
 * Uses constant-time comparison — do NOT replace with `===` or `Buffer.equals`
 * without understanding the timing-attack implications.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored || !plain) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEY_BYTES) return false;

  const computed = scryptSync(plain, salt, KEY_BYTES);
  return timingSafeEqual(computed, expected);
}
