import { createHash, timingSafeEqual } from "crypto";

/**
 * REL-05: constant-time comparison of two shared secrets.
 *
 * A plain `a === b` / `a !== b` short-circuits on the first differing byte and
 * also leaks length, letting an attacker recover a server-to-server secret via
 * timing. We hash both sides to a fixed 32-byte SHA-256 digest (so unequal
 * lengths neither throw in `timingSafeEqual` nor leak) and compare the digests
 * in constant time.
 *
 * Fail-closed: returns false for any missing/empty input.
 */
export function safeSecretEqual(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
