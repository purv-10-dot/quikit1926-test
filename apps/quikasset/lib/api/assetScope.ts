import { db } from "@/lib/db";

/**
 * ⚠️ STOPGAP — email-matched asset ownership. NOT the real fix.
 *
 * There is no foreign key between the platform User (the auth identity behind
 * `session.user.id`) and `AstEmployee` (the row that asset assignments point
 * at via `AstAssignment.userId`). The only shared field is `email`, so to
 * answer "which assets is the signed-in user assigned?" we bridge on email.
 *
 * This is fragile:
 *   • a signed-in user whose email does not EXACTLY match an `AstEmployee.email`
 *     for this org resolves to no employee → they see NOTHING (false empty);
 *   • it assumes email is unique + stable per org (the schema's
 *     `@@unique([orgId, email])` gives uniqueness, not stability).
 *
 * Replace with a real link once `AstEmployee.userId` lands — see
 * docs/ASSET_IDENTITY_BRIDGE_PROPOSAL.md. When that FK exists, swap the
 * email lookup here for `where: { orgId, userId }` and delete this warning.
 */

/** Resolve the caller's AstEmployee id by case-insensitive email match, or null. */
export async function employeeIdForEmail(
  orgId: string,
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;
  const employee = await db.astEmployee.findFirst({
    where: { orgId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  return employee?.id ?? null;
}

/**
 * Asset ids currently (Active) assigned to the caller, via the email→employee
 * bridge above. Empty array when the caller maps to no employee or has no
 * active assignments — callers should treat that as "show nothing".
 */
export async function assignedAssetIdsForEmail(
  orgId: string,
  email: string | null | undefined,
): Promise<string[]> {
  const employeeId = await employeeIdForEmail(orgId, email);
  if (!employeeId) return [];
  const rows = await db.astAssignment.findMany({
    where: { orgId, userId: employeeId, status: "Active" },
    select: { assetId: true },
  });
  return [...new Set(rows.map((r) => r.assetId))];
}
