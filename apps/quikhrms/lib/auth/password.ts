import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const ROUNDS = 10;

/**
 * Generate a random temporary password that satisfies the password policy
 * (1 upper, 1 lower, 1 number, 1 special, length within 5–25). Used for
 * admin-set temporary passwords. ~12 chars, no ambiguous look-alikes.
 */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%&*?";
  const all = upper + lower + digit + special;

  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(special)];
  while (chars.length < 12) chars.push(pick(all));

  // Fisher–Yates shuffle so the guaranteed chars aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}
