/**
 * Pure selector for the RepairRequest Member-grant backfill: of the grants a
 * Member role SHOULD hold for the employee repair-request feature, which are
 * missing on a given role? DB-free so it is unit-testable;
 * backfill-repairrequest-member-grants.ts feeds it live permission rows.
 *
 * These two pairs let a Member raise a repair request on their own assigned
 * asset and see their own — deliberately NOT `viewAll` (that reveals the
 * approver queue). Mirrors the RepairRequest entries in MEMBER_DEFAULT_GRANTS
 * (lib/api/seedAppRoles.ts).
 */
export const REPAIR_REQUEST_MEMBER_GRANTS: ReadonlyArray<{ resource: string; action: string }> = [
  { resource: "RepairRequest", action: "view" },
  { resource: "RepairRequest", action: "create" },
];

/** Target grants not already present on the role's permission list. */
export function selectMissingGrants(
  existing: Iterable<{ resource: string; action: string }>,
): Array<{ resource: string; action: string }> {
  const have = new Set([...existing].map((p) => `${p.resource}:${p.action}`));
  return REPAIR_REQUEST_MEMBER_GRANTS.filter((g) => !have.has(`${g.resource}:${g.action}`));
}
