/**
 * Best-effort display name from an email address. Used as a fallback when
 * an invited user has not set their User.name yet.
 *
 * Rules:
 *   1. Take the local part (before @)
 *   2. Strip trailing digits         (priya.sharma78 → priya.sharma)
 *   3. Split on `.`, `_`, `-`        (priya.sharma   → ["priya","sharma"])
 *   4. Capitalize each segment
 *   5. Join with single spaces
 *
 * Examples:
 *   priya.sharma78@gmail.com → "Priya Sharma"
 *   john_doe123@outlook.com  → "John Doe"
 *   sarah-jane@company.com   → "Sarah Jane"
 *   alex@gmail.com           → "Alex"
 *
 * Returns the email as-is when it doesn't contain `@` (defensive — never
 * blow up on garbage input).
 */
export function parseNameFromEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  const at = email.indexOf("@");
  const local = at >= 0 ? email.slice(0, at) : email;

  // Strip trailing digits.
  const stripped = local.replace(/\d+$/, "");

  const parts = stripped
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    // All digits or empty after stripping — fall back to original local.
    return local || email;
  }

  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
