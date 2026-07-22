/**
 * Pure planning logic for the Phase-2 identity-bridge backfill
 * (AstEmployee.userId → auth.User). Kept DB-free so it is unit-testable; the
 * runnable migration (link-employees-to-users.ts) feeds it real rows.
 *
 * Buckets per employee:
 *   - "matched": email matches a User who is an OrgMember of the SAME org →
 *                would set userId to that user.
 *   - "blocked": no such user, but the employee has assignment/replacement
 *                history → deleting it would violate the ON DELETE RESTRICT FKs
 *                (assignments/replacements → employees). Needs a human decision.
 *   - "delete":  no such user AND no history → a demo/seed row safe to delete.
 */

export type Bucket = "matched" | "blocked" | "delete";

/** Case-insensitive, whitespace-trimmed email key — mirrors the assetScope stopgap. */
export const normEmail = (email: string): string => email.trim().toLowerCase();

export type EmployeePlanInput = {
  email: string;
  assignments: number;
  replacements: number;
};

export type EmployeePlan = {
  bucket: Bucket;
  matchedUserId: string | null;
  hasHistory: boolean;
};

/**
 * Decide an employee's fate.
 * @param emp              the employee's email + history counts
 * @param orgMembersByEmail normalized-email → userId, for OrgMembers of the
 *                          employee's own org only (callers must pre-scope).
 */
export function planEmployee(
  emp: EmployeePlanInput,
  orgMembersByEmail: Map<string, string>,
): EmployeePlan {
  const matchedUserId = orgMembersByEmail.get(normEmail(emp.email)) ?? null;
  const hasHistory = emp.assignments > 0 || emp.replacements > 0;
  const bucket: Bucket = matchedUserId ? "matched" : hasHistory ? "blocked" : "delete";
  return { bucket, matchedUserId, hasHistory };
}
