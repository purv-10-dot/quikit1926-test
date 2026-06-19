import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // base62

/**
 * Generate a short, URL-friendly base62 code for "tiny" public share links
 * (e.g. /share/Xk2Pq7Rm). 8 chars ≈ 62^8 ≈ 2.18×10^14 combinations — not
 * enumerable in practice. Callers must enforce uniqueness (the QtDoc.shareToken
 * unique index) and regenerate on the rare collision.
 */
export function shortCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
