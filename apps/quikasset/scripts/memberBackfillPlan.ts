/**
 * Pure selector for the Phase-3 role-cleanup backfill: of the users who have
 * QuikAsset access, which hold NO app role? Those get the org's default Member
 * role. DB-free so it is unit-testable; backfill-member-role.ts feeds it live
 * rows. Preserves input order and de-duplication is the caller's concern.
 */
export function selectNoRoleUsers(
  accessUserIds: string[],
  roledUserIds: Iterable<string>,
): string[] {
  const roled = new Set(roledUserIds);
  return accessUserIds.filter((id) => !roled.has(id));
}
