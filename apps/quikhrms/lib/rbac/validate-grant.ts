import { PERMISSION_CODES } from "@/lib/rbac/permissions";

const KNOWN = new Set<string>(PERMISSION_CODES);

/**
 * Central guard for every RBAC write path (role create / role permissions /
 * per-user permission grants). Enforces three rules:
 *
 *  1. No wildcard — "*" is never a grantable code (it's the super-admin marker,
 *     not a real permission; it isn't in PERMISSION_CODES so it's rejected).
 *  2. No unknown codes — only codes from the registry may be granted.
 *  3. No self-elevation — you can't grant a permission you don't already hold.
 *     Super-admins ("*" in their own permission set) bypass this.
 *
 * Returns `{ ok: true }` or `{ ok: false, error }` with a user-facing message.
 */
export function validateGrantableCodes(
  requested: string[],
  callerPermissions: string[],
): { ok: true } | { ok: false; error: string } {
  const unknown = requested.filter((c) => !KNOWN.has(c));
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown or disallowed permissions: ${unknown.join(", ")}` };
  }
  if (callerPermissions.includes("*")) return { ok: true };
  const held = new Set(callerPermissions);
  const escalations = requested.filter((c) => !held.has(c));
  if (escalations.length > 0) {
    return { ok: false, error: `You can only grant permissions you already hold. Not allowed: ${escalations.join(", ")}` };
  }
  return { ok: true };
}
